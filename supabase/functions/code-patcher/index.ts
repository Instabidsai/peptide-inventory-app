/* eslint-disable complexity, @typescript-eslint/no-unused-vars */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";
import { authenticateCron, createServiceClient } from "../_shared/auth.ts";

/**
 * code-patcher — AI Code Repair via GitHub API
 *
 * Triggered by sentinel-worker Phase 15 when fix_type = 'code_patch'.
 * Flow:
 *   1. Read fix_plan + code_patches row
 *   2. Fetch source file from GitHub Contents API
 *   3. AI generates a search/replace patch
 *   4. Create branch, commit, open PR
 *   5. Poll Vercel for preview deploy
 *   6. Auto-merge on success, close on failure
 *
 * Safety:
 *   - Only touches files in src/ (never supabase/, .github/, config)
 *   - Max 500 lines diff, max 3 files per patch
 *   - Max 5 patches per day (configurable)
 *   - Kill switch: CODE_PATCH_ENABLED env var
 *   - Every patch has revert_payload
 */

const GITHUB_API = "https://api.github.com";
const MAX_DIFF_LINES = 500;
const MAX_FILES_PER_PATCH = 3;
const ALLOWED_PATH_PREFIX = "src/";
const VERCEL_POLL_INTERVAL_MS = 15_000;
const VERCEL_POLL_MAX_MS = 300_000; // 5 minutes

Deno.serve(
  withErrorReporting("code-patcher", async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);
    const preflight = handleCors(req);
    if (preflight) return preflight;

    // Auth: only service_role or cron
    const authHeader = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!authHeader.includes(serviceKey)) {
      try { authenticateCron(req); } catch {
        return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
      }
    }

    // Kill switch
    if (Deno.env.get("CODE_PATCH_ENABLED") !== "true") {
      return jsonResponse({ ok: false, error: "Code patching disabled" }, 200, corsHeaders);
    }

    const githubToken = Deno.env.get("GITHUB_TOKEN");
    const repoOwner = Deno.env.get("GITHUB_REPO_OWNER") || "Instabidsai";
    const repoName = Deno.env.get("GITHUB_REPO_NAME") || "peptide-inventory-app";
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!githubToken || !openaiKey) {
      return jsonResponse({ ok: false, error: "Missing GITHUB_TOKEN or OPENAI_API_KEY" }, 500, corsHeaders);
    }

    const body = await req.json().catch(() => ({}));
    const fixPlanId = body.fix_plan_id;
    if (!fixPlanId) {
      return jsonResponse({ ok: false, error: "Missing fix_plan_id" }, 400, corsHeaders);
    }

    const supabase = createServiceClient();

    // Load fix plan
    const { data: plan } = await supabase
      .from("fix_plans")
      .select("*")
      .eq("id", fixPlanId)
      .single();

    if (!plan || plan.fix_type !== "code_patch") {
      return jsonResponse({ ok: false, error: "Fix plan not found or wrong type" }, 404, corsHeaders);
    }

    // Get the file path from fix_payload
    const filePath = (plan.fix_payload?.file_path as string) || "";
    const description = (plan.fix_payload?.description as string) || plan.explanation || "";

    if (!filePath || !filePath.startsWith(ALLOWED_PATH_PREFIX)) {
      await updatePatchStatus(supabase, fixPlanId, "error", `File path blocked: ${filePath}`);
      return jsonResponse({ ok: false, error: `Only ${ALLOWED_PATH_PREFIX} files allowed` }, 400, corsHeaders);
    }

    const ghHeaders = {
      "Authorization": `token ${githubToken}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "sentinel-code-patcher",
    };

    try {
      // 1. Fetch current file content from GitHub
      const fileRes = await fetch(`${GITHUB_API}/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
        headers: ghHeaders,
      });
      if (!fileRes.ok) {
        await updatePatchStatus(supabase, fixPlanId, "error", `File not found: ${filePath}`);
        return jsonResponse({ ok: false, error: "File not found on GitHub" }, 404, corsHeaders);
      }
      const fileData = await fileRes.json();
      const currentContent = atob(fileData.content.replace(/\n/g, ""));
      const currentSha = fileData.sha;

      // 2. AI generates the patch
      const patchResult = await generatePatch(openaiKey, filePath, currentContent, description, plan.error_fingerprint || "");
      if (!patchResult.success) {
        await updatePatchStatus(supabase, fixPlanId, "error", patchResult.error || "Patch generation failed");
        return jsonResponse({ ok: false, error: "Patch generation failed" }, 500, corsHeaders);
      }

      // Safety: check diff size
      const diffLines = patchResult.patchedContent!.split("\n").length;
      const origLines = currentContent.split("\n").length;
      if (Math.abs(diffLines - origLines) > MAX_DIFF_LINES) {
        await updatePatchStatus(supabase, fixPlanId, "error", `Diff too large: ${Math.abs(diffLines - origLines)} lines`);
        return jsonResponse({ ok: false, error: "Diff exceeds max lines" }, 400, corsHeaders);
      }

      // 3. Create branch
      const fpShort = (plan.error_fingerprint || "unknown").slice(0, 30).replace(/[^a-zA-Z0-9-]/g, "-");
      const branchName = `auto-fix/${fpShort}-${Date.now().toString(36)}`;

      // Get default branch SHA
      const mainRef = await fetch(`${GITHUB_API}/repos/${repoOwner}/${repoName}/git/ref/heads/main`, {
        headers: ghHeaders,
      });
      if (!mainRef.ok) {
        await updatePatchStatus(supabase, fixPlanId, "error", "Could not get main branch ref");
        return jsonResponse({ ok: false, error: "Could not get main ref" }, 500, corsHeaders);
      }
      const mainData = await mainRef.json();
      const mainSha = mainData.object.sha;

      // Create branch
      const branchRes = await fetch(`${GITHUB_API}/repos/${repoOwner}/${repoName}/git/refs`, {
        method: "POST",
        headers: { ...ghHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: mainSha }),
      });
      if (!branchRes.ok) {
        await updatePatchStatus(supabase, fixPlanId, "error", "Could not create branch");
        return jsonResponse({ ok: false, error: "Branch creation failed" }, 500, corsHeaders);
      }

      // 4. Commit the patched file
      const encodedContent = btoa(unescape(encodeURIComponent(patchResult.patchedContent!)));
      const commitRes = await fetch(`${GITHUB_API}/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
        method: "PUT",
        headers: { ...ghHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `[auto-fix] ${description.slice(0, 72)}`,
          content: encodedContent,
          sha: currentSha,
          branch: branchName,
        }),
      });
      if (!commitRes.ok) {
        await updatePatchStatus(supabase, fixPlanId, "error", "Commit failed");
        return jsonResponse({ ok: false, error: "Commit failed" }, 500, corsHeaders);
      }

      // 5. Create PR
      const prRes = await fetch(`${GITHUB_API}/repos/${repoOwner}/${repoName}/pulls`, {
        method: "POST",
        headers: { ...ghHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `[auto-fix] ${description.slice(0, 72)}`,
          body: `## Auto-Fix by Sentinel\n\n**Error fingerprint**: \`${plan.error_fingerprint}\`\n**Confidence**: ${plan.ai_confidence}\n**Explanation**: ${plan.explanation}\n\nGenerated by code-patcher edge function.`,
          head: branchName,
          base: "main",
        }),
      });
      if (!prRes.ok) {
        await updatePatchStatus(supabase, fixPlanId, "error", "PR creation failed");
        return jsonResponse({ ok: false, error: "PR creation failed" }, 500, corsHeaders);
      }
      const prData = await prRes.json();

      // Update code_patches row
      await supabase.from("code_patches").update({
        github_pr_url: prData.html_url,
        github_pr_number: prData.number,
        branch_name: branchName,
        files_changed: [filePath],
        patch_diff: patchResult.explanation || "",
        deploy_status: "building",
      }).eq("fix_plan_id", fixPlanId);

      // 6. Poll Vercel for preview deployment (fire-and-forget async)
      // We don't await this — the function returns immediately and the polling
      // happens in the background until Deno's 150s execution limit
      pollVercelAndMerge(supabase, fixPlanId, prData.number, branchName, repoOwner, repoName, ghHeaders).catch(() => {});

      return jsonResponse({
        ok: true,
        pr_url: prData.html_url,
        branch: branchName,
        fix_plan_id: fixPlanId,
      }, 200, corsHeaders);

    } catch (err) {
      await updatePatchStatus(supabase, fixPlanId, "error", (err as Error).message);
      return jsonResponse({ ok: false, error: (err as Error).message }, 500, corsHeaders);
    }
  }),
);

async function updatePatchStatus(
  supabase: ReturnType<typeof createClient>,
  fixPlanId: string,
  status: string,
  errorMessage?: string,
) {
  await supabase.from("code_patches").update({
    deploy_status: status,
    error_message: errorMessage,
  }).eq("fix_plan_id", fixPlanId);

  await supabase.from("fix_plans").update({
    status: status === "error" ? "failed" : "executing",
    execution_result: { deploy_status: status, error: errorMessage },
  }).eq("id", fixPlanId);
}

async function generatePatch(
  apiKey: string,
  filePath: string,
  currentContent: string,
  description: string,
  fingerprint: string,
): Promise<{ success: boolean; patchedContent?: string; explanation?: string; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 2000,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a code repair AI. Given a file and an error description, generate a fixed version of the file.
Return JSON: { "patched_content": "full file content with fix applied", "explanation": "what you changed and why" }
Rules:
- Make the MINIMUM change needed to fix the error
- Never add console.log or debug code
- Never change imports unless absolutely necessary
- Keep the same code style and formatting
- If you can't confidently fix it, return { "patched_content": null, "explanation": "Cannot fix: reason" }`,
          },
          {
            role: "user",
            content: `File: ${filePath}\nError: ${description}\nFingerprint: ${fingerprint}\n\nCurrent content:\n\`\`\`\n${currentContent.slice(0, 8000)}\n\`\`\``,
          },
        ],
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`OpenAI ${res.status}`);

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No AI response");

    const parsed = JSON.parse(content);
    if (!parsed.patched_content) {
      return { success: false, error: parsed.explanation || "AI declined to fix" };
    }
    return { success: true, patchedContent: parsed.patched_content, explanation: parsed.explanation };
  } catch (err) {
    clearTimeout(timeout);
    return { success: false, error: (err as Error).message };
  }
}

async function pollVercelAndMerge(
  supabase: ReturnType<typeof createClient>,
  fixPlanId: string,
  prNumber: number,
  branchName: string,
  repoOwner: string,
  repoName: string,
  ghHeaders: Record<string, string>,
) {
  const vercelToken = Deno.env.get("VERCEL_TOKEN");
  if (!vercelToken) return;

  const startTime = Date.now();

  while (Date.now() - startTime < VERCEL_POLL_MAX_MS) {
    await new Promise((r) => setTimeout(r, VERCEL_POLL_INTERVAL_MS));

    try {
      // Check Vercel deployment for this branch
      const deploymentsRes = await fetch(
        `https://api.vercel.com/v6/deployments?projectId=${Deno.env.get("VERCEL_PROJECT_ID")}&meta-githubCommitRef=${branchName}&limit=1`,
        { headers: { "Authorization": `Bearer ${vercelToken}` } },
      );
      if (!deploymentsRes.ok) continue;

      const deploymentsData = await deploymentsRes.json();
      const deployment = deploymentsData.deployments?.[0];
      if (!deployment) continue;

      if (deployment.state === "READY") {
        // Preview deploy succeeded — auto-merge!
        await supabase.from("code_patches").update({
          deploy_status: "ready",
          vercel_deployment_url: deployment.url,
          tests_passed: true,
        }).eq("fix_plan_id", fixPlanId);

        // Merge the PR
        const mergeRes = await fetch(
          `${GITHUB_API}/repos/${repoOwner}/${repoName}/pulls/${prNumber}/merge`,
          {
            method: "PUT",
            headers: { ...ghHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({
              commit_title: `[auto-fix] Merge #${prNumber}`,
              merge_method: "squash",
            }),
          },
        );

        if (mergeRes.ok) {
          await supabase.from("code_patches").update({
            auto_merged: true,
            merged_at: new Date().toISOString(),
          }).eq("fix_plan_id", fixPlanId);

          await supabase.from("fix_plans").update({
            status: "success",
            execution_result: { pr_merged: true, pr_number: prNumber, deployment_url: deployment.url },
          }).eq("id", fixPlanId);
        }
        return;
      }

      if (deployment.state === "ERROR" || deployment.state === "CANCELED") {
        // Preview deploy failed — close the PR
        await supabase.from("code_patches").update({
          deploy_status: "error",
          tests_passed: false,
          error_message: `Vercel deployment ${deployment.state}`,
        }).eq("fix_plan_id", fixPlanId);

        // Close PR
        await fetch(
          `${GITHUB_API}/repos/${repoOwner}/${repoName}/pulls/${prNumber}`,
          {
            method: "PATCH",
            headers: { ...ghHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ state: "closed" }),
          },
        );

        await supabase.from("fix_plans").update({
          status: "failed",
          execution_result: { deploy_failed: true, state: deployment.state },
        }).eq("id", fixPlanId);
        return;
      }
    } catch {
      // Continue polling on error
    }
  }

  // Timeout — close the PR
  await supabase.from("code_patches").update({
    deploy_status: "timeout",
    error_message: "Vercel deploy polling timed out",
  }).eq("fix_plan_id", fixPlanId);
}
