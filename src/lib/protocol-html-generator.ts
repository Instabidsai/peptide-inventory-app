// ── Rich Protocol Document Generator ───────────────────────────
// Generates professional HTML + plain-text protocol documents
// for email, print, and clipboard delivery.

import type { SupplementNote, DosingTier } from '@/data/protocol-knowledge';
import { RECOMMENDED_SUPPLIES, RECONSTITUTION_VIDEO_URL } from '@/data/protocol-knowledge';

// ── Types ──────────────────────────────────────────────────────

export interface IncludeSections {
    description: boolean;
    reconstitution: boolean;
    warning: boolean;
    cyclePattern: boolean;
    tierNotes: boolean;
    supplements: boolean;
    dosageSchedule: boolean;
}

export interface EnrichedProtocolItem {
    /** Unique instance key — allows same peptide to appear multiple times */
    instanceId: string;
    peptideId: string;
    peptideName: string;
    vialSizeMg: number | null;
    protocolDescription: string | null;
    reconstitutionMl: number;
    doseAmount: number;
    doseUnit: string;
    administrationRoute: string;
    frequency: string;
    timing: string;
    concentrationMgMl: number;
    warningText: string | null;
    cyclePattern: string | null;
    cyclePatternOptions: string[];
    stackLabel: string | null;
    dosageSchedule: string | null;
    notes: string;
    supplements: SupplementNote[];
    // Dosing tier support
    selectedTierId: string | null;
    availableTiers: DosingTier[];
    // Category for color-coding
    category?: string;
    // Section toggles — controls what appears in email output
    includeSections: IncludeSections;
}

interface GeneratorOptions {
    items: EnrichedProtocolItem[];
    clientName: string;
    orgName?: string;
    includeSupplies?: boolean;
}

// ── Shared Helpers ─────────────────────────────────────────────

export function calcMl(item: { doseAmount: number; doseUnit: string; concentrationMgMl: number; vialSizeMg?: number | null; reconstitutionMl?: number }): number | null {
    if (!item.doseAmount || item.doseAmount <= 0) return null;
    // Always derive concentration from vial/water when available (never stale)
    let concentration = item.concentrationMgMl;
    if (item.vialSizeMg != null && item.vialSizeMg > 0 && item.reconstitutionMl != null && item.reconstitutionMl > 0) {
        concentration = item.vialSizeMg / item.reconstitutionMl;
    }
    if (!concentration || concentration <= 0 || !isFinite(concentration)) return null;
    if (item.doseUnit === 'iu') return null;
    const doseMg = item.doseUnit === 'mcg' ? item.doseAmount / 1000 : item.doseAmount;
    return doseMg / concentration;
}

export function calcUnits(ml: number | null): number | null {
    if (ml === null) return null;
    return Math.round(ml * 100);
}

export function formatMl(ml: number | null): string {
    if (ml === null) return '\u2014';
    return ml < 0.01 ? ml.toFixed(3) : ml.toFixed(2);
}

export function formatFrequency(freq: string): string {
    const map: Record<string, string> = {
        'daily': 'once daily',
        'daily_am_pm': 'twice daily (AM & PM)',
        'twice daily': 'twice daily',
        'every other day': 'every other day',
        'every 3 days': 'every three days',
        'every 5 days': 'every five days',
        'weekly': 'once weekly',
        'twice weekly': 'twice weekly',
        '3x weekly': 'three times per week',
        'biweekly': 'twice per week',
        'monthly': 'once monthly',
        'as needed': 'as needed',
    };
    return map[freq] || freq;
}

export function formatFrequencyShort(freq: string): string {
    const map: Record<string, string> = {
        'daily': 'Daily',
        'daily_am_pm': 'Daily (AM & PM)',
        'twice daily': 'Twice Daily',
        'every other day': 'Every Other Day',
        'every 3 days': 'Every 3 Days',
        'every 5 days': 'Every 5 Days',
        'weekly': 'Weekly',
        'twice weekly': 'Twice Weekly',
        '3x weekly': '3x / Week',
        'biweekly': '2x / Week',
        'monthly': 'Monthly',
        'as needed': 'As Needed',
    };
    return map[freq] || freq;
}

function formatRoute(route: string): string {
    const map: Record<string, string> = {
        'subcutaneous': 'subcutaneously',
        'intranasal': 'intranasally',
        'intramuscular': 'intramuscularly',
        'oral': 'orally',
        'topical': 'topically',
    };
    return map[route] || route;
}

function formatDoseLabel(item: EnrichedProtocolItem): string {
    const unit = item.doseUnit === 'iu' ? 'IU' : item.doseUnit;
    return `${item.doseAmount} ${unit}`;
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── HTML Generator ─────────────────────────────────────────────

export function generateProtocolHtml({ items, clientName, orgName = 'Peptide Admin', includeSupplies = true }: GeneratorOptions): string {
    const itemsHtml = items.map((item, idx) => {
        const ml = calcMl(item);
        const units = calcUnits(ml);
        const vialLabel = item.vialSizeMg ? ` (${item.vialSizeMg} mg Vial)` : '';
        const stackLabel = item.stackLabel ? ` - ${escapeHtml(item.stackLabel)}` : '';
        const selectedTier = item.availableTiers?.find(t => t.id === item.selectedTierId);

        let sections = '';
        const inc = item.includeSections;

        // Tier badge
        if (selectedTier) {
            sections += `<p style="margin:0 0 8px;"><span style="display:inline-block;padding:2px 8px;background:#EEF2FF;color:#4338CA;border-radius:4px;font-size:11px;font-weight:600;">${escapeHtml(selectedTier.label)}</span></p>`;
        }

        // Description
        if (item.protocolDescription && inc.description) {
            sections += `<p style="margin:8px 0 12px;color:#374151;line-height:1.6;">${escapeHtml(item.protocolDescription)}</p>`;
        }

        // Reconstitution
        if (item.reconstitutionMl > 0 && item.vialSizeMg && inc.reconstitution) {
            sections += `<p style="margin:4px 0;color:#374151;"><strong>Reconstitution:</strong> Add ${item.reconstitutionMl} mL of bacteriostatic water to a ${item.vialSizeMg} mg vial.</p>`;
        }

        // Dosage — ALWAYS included, prominent styling
        if (item.dosageSchedule && inc.dosageSchedule) {
            const scheduleLines = item.dosageSchedule.split('\n').map(l => escapeHtml(l)).join('<br/>');
            sections += `
                <div style="margin:12px 0;padding:14px 18px;background:#F0FDF4;border:2px solid #86EFAC;border-radius:8px;">
                    <p style="margin:0;color:#166534;font-size:16px;font-weight:700;">\uD83D\uDC89 Dosage Schedule</p>
                    <p style="margin:6px 0 0;color:#166534;font-size:14px;line-height:1.7;">${scheduleLines}</p>
                </div>`;
        } else {
            const doseLabel = formatDoseLabel(item);
            const route = formatRoute(item.administrationRoute);
            const freq = formatFrequency(item.frequency);
            sections += `
                <div style="margin:12px 0;padding:14px 18px;background:#F0FDF4;border:2px solid #86EFAC;border-radius:8px;">
                    <p style="margin:0;color:#166534;font-size:18px;font-weight:700;">
                        \uD83D\uDC89 ${escapeHtml(doseLabel)} \u2014 ${route}, ${freq}
                    </p>
                </div>`;
        }

        // Timing
        sections += `<p style="margin:8px 0;color:#374151;font-size:14px;"><strong>Timing:</strong> ${escapeHtml(item.timing === 'none' ? 'No specific preference' : item.timing)}${item.stackLabel && item.stackLabel.includes('Part 2') ? ' (Take this shot 30 minutes AFTER the previous).' : item.stackLabel && item.stackLabel.includes('Part 1') ? ' (Take this shot 1st, on an empty stomach).' : '.'}</p>`;

        // Draw — ALWAYS included when available, prominent styling
        if (units !== null && ml !== null) {
            sections += `
                <div style="margin:8px 0 12px;padding:12px 18px;background:#EFF6FF;border:2px solid #93C5FD;border-radius:8px;">
                    <p style="margin:0;color:#1E40AF;font-size:16px;font-weight:700;">
                        \uD83D\uDD35 Draw: ${units} units (${formatMl(ml)} mL) on a U-100 insulin syringe
                    </p>
                </div>`;
        }

        // Cycle pattern
        if (item.cyclePattern && inc.cyclePattern) {
            sections += `<p style="margin:4px 0;color:#374151;"><strong>Cycle:</strong> ${escapeHtml(item.cyclePattern)}</p>`;
        }

        // Tier notes
        if (selectedTier?.notes && inc.tierNotes) {
            sections += `<p style="margin:4px 0;color:#4B5563;font-size:13px;font-style:italic;"><strong>Protocol Notes:</strong> ${escapeHtml(selectedTier.notes)}</p>`;
        }

        // Warning
        if (item.warningText && inc.warning) {
            sections += `
                <div style="margin:10px 0;padding:10px 14px;background:#FEF3C7;border-left:4px solid #F59E0B;border-radius:4px;">
                    <p style="margin:0;color:#92400E;font-size:13px;"><strong>\u26A0\uFE0F Warning:</strong> ${escapeHtml(item.warningText)}</p>
                </div>`;
        }

        // Supplement notes
        if (item.supplements.length > 0 && inc.supplements) {
            for (const supp of item.supplements) {
                let suppHtml = `<div style="margin:10px 0;padding:10px 14px;background:#EFF6FF;border-left:4px solid #3B82F6;border-radius:4px;">`;
                suppHtml += `<p style="margin:0 0 4px;color:#1E40AF;font-size:13px;"><strong>\uD83D\uDC8A Supplement Note:</strong> ${escapeHtml(supp.reason)}</p>`;
                suppHtml += `<p style="margin:0;color:#1E40AF;font-size:13px;"><strong>Dosage:</strong> ${escapeHtml(supp.dosage)}</p>`;
                if (supp.productName) {
                    suppHtml += `<p style="margin:2px 0 0;color:#1E40AF;font-size:13px;"><strong>Recommended Product:</strong> ${escapeHtml(supp.productName)}`;
                    if (supp.productLink) {
                        suppHtml += ` (<a href="${escapeHtml(supp.productLink)}" style="color:#2563EB;text-decoration:underline;" target="_blank">Amazon Link</a>)`;
                    }
                    suppHtml += `</p>`;
                }
                suppHtml += `</div>`;
                sections += suppHtml;
            }
        }

        // Custom notes
        if (item.notes) {
            sections += `<p style="margin:4px 0;color:#6B7280;font-style:italic;"><strong>Notes:</strong> ${escapeHtml(item.notes)}</p>`;
        }

        return `
            <div style="margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #E5E7EB;">
                <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:700;">
                    ${idx + 1}. ${escapeHtml(item.peptideName)}${escapeHtml(vialLabel)}${escapeHtml(stackLabel)}
                </h2>
                ${sections}
            </div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Peptide Protocol - ${escapeHtml(clientName || 'Client')}</title>
    <style>
        @media print {
            body { font-size: 12px; }
            .no-print { display: none !important; }
        }
    </style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#ffffff;color:#111827;">
    <div style="max-width:680px;margin:0 auto;padding:32px 24px;">
        <!-- Header -->
        <div style="text-align:center;margin-bottom:32px;">
            <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:#111827;letter-spacing:-0.5px;">
                ${escapeHtml(orgName)} Peptide Protocols
            </h1>
            <div style="padding:12px 16px;background:#FEF3C7;border-radius:8px;margin-bottom:8px;">
                <p style="margin:0;font-size:12px;color:#92400E;line-height:1.5;">
                    <strong>Disclaimer:</strong> The following information is for educational purposes only and does not constitute medical advice. Always consult with a qualified healthcare professional before beginning any peptide therapy.
                </p>
            </div>
            ${clientName ? `<p style="margin:8px 0 0;color:#6B7280;font-size:14px;">Prepared for <strong>${escapeHtml(clientName)}</strong></p>` : ''}
        </div>

        <!-- Protocol Items -->
        ${itemsHtml}

        ${includeSupplies ? `
        <!-- What You'll Need -->
        <div style="margin:28px 0;padding:20px 24px;background:#F8FAFC;border:2px solid #E2E8F0;border-radius:12px;">
            <h3 style="margin:0 0 14px;color:#111827;font-size:16px;font-weight:700;">\uD83D\uDECD\uFE0F What You'll Need</h3>
            ${RECOMMENDED_SUPPLIES.map(s => `
                <div style="margin:0 0 10px;padding:10px 14px;background:#ffffff;border:1px solid #E5E7EB;border-radius:8px;">
                    <a href="${escapeHtml(s.link)}" style="color:#2563EB;font-size:14px;font-weight:600;text-decoration:none;" target="_blank">${escapeHtml(s.name)} \u2192</a>
                    <p style="margin:4px 0 0;color:#6B7280;font-size:12px;">${escapeHtml(s.description)}</p>
                </div>
            `).join('')}
            <div style="margin:14px 0 0;padding:12px 14px;background:#FEE2E2;border-radius:8px;">
                <a href="${RECONSTITUTION_VIDEO_URL}" style="color:#DC2626;font-size:14px;font-weight:600;text-decoration:none;" target="_blank">\u25B6\uFE0F Watch: How to Reconstitute Peptides (Video Guide)</a>
                <p style="margin:4px 0 0;color:#991B1B;font-size:12px;">Step-by-step walkthrough of mixing and preparing your peptides safely.</p>
            </div>
        </div>
        ` : ''}

        <!-- Footer -->
        <div style="margin-top:32px;padding-top:20px;border-top:2px solid #E5E7EB;">
            <h3 style="margin:0 0 8px;color:#111827;font-size:15px;">General Guidelines</h3>
            <p style="margin:4px 0;color:#374151;font-size:13px;">\uD83C\uDF21\uFE0F <strong>Storage:</strong> Refrigerate all reconstituted peptides. Keep away from heat and light.</p>
            <p style="margin:4px 0;color:#374151;font-size:13px;">\uD83D\uDC89 <strong>Syringes:</strong> Use 1 mL insulin syringes with 100 unit markings (U-100).</p>
            <p style="margin:4px 0;color:#374151;font-size:13px;">\uD83E\uDDF4 <strong>Alcohol Swabs:</strong> Always clean the vial top and injection site before use.</p>
            <p style="margin:16px 0 0;color:#6B7280;font-size:13px;">Questions? Reply to this email or reach out anytime.</p>
            <p style="margin:12px 0 0;color:#111827;font-size:14px;font-weight:600;">
                \u2014 ${escapeHtml(orgName)}
            </p>
        </div>
    </div>
</body>
</html>`;
}

// ── Plain Text Generator (for mailto:) ─────────────────────────

export function generateProtocolPlainText({ items, clientName, orgName = 'Peptide Admin', includeSupplies = true }: GeneratorOptions): string {
    const lines: string[] = [];
    lines.push(`${orgName.toUpperCase()} PEPTIDE PROTOCOLS`);
    lines.push('');
    lines.push('Disclaimer: The following information is for educational purposes only and does not constitute medical advice. Always consult with a qualified healthcare professional before beginning any peptide therapy.');
    lines.push('');

    if (clientName) {
        lines.push(`Prepared for: ${clientName}`);
        lines.push('');
    }

    lines.push('\u2501'.repeat(40));

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const ml = calcMl(item);
        const units = calcUnits(ml);
        const vialLabel = item.vialSizeMg ? ` (${item.vialSizeMg} mg Vial)` : '';
        const stackLabel = item.stackLabel ? ` - ${item.stackLabel}` : '';
        const inc = item.includeSections;

        const selectedTierTxt = item.availableTiers?.find(t => t.id === item.selectedTierId);

        lines.push('');
        lines.push(`${i + 1}. ${item.peptideName}${vialLabel}${stackLabel}`);
        if (selectedTierTxt) {
            lines.push(`   [${selectedTierTxt.label}]`);
        }
        lines.push('');

        if (item.protocolDescription && inc.description) {
            lines.push(`Description: ${item.protocolDescription}`);
            lines.push('');
        }

        if (item.reconstitutionMl > 0 && item.vialSizeMg && inc.reconstitution) {
            lines.push(`Reconstitution: Add ${item.reconstitutionMl} mL of bacteriostatic water to a ${item.vialSizeMg} mg vial.`);
        }

        if (item.dosageSchedule && inc.dosageSchedule) {
            lines.push(`Dosage Schedule:`);
            item.dosageSchedule.split('\n').forEach(l => lines.push(`  ${l}`));
        } else {
            const doseLabel = formatDoseLabel(item);
            const route = formatRoute(item.administrationRoute);
            const freq = formatFrequency(item.frequency);
            lines.push(`>>> DOSAGE: ${doseLabel} administered ${route} ${freq}.`);
        }

        const timingText = item.timing === 'none' ? 'No specific preference' : item.timing;
        lines.push(`Timing: ${timingText}.`);

        if (units !== null && ml !== null) {
            lines.push(`>>> DRAW: ${units} units (${formatMl(ml)} mL) on a U-100 insulin syringe.`);
        }

        if (item.cyclePattern && inc.cyclePattern) {
            lines.push(`Cycle: ${item.cyclePattern}`);
        }

        if (selectedTierTxt?.notes && inc.tierNotes) {
            lines.push(`Protocol Notes: ${selectedTierTxt.notes}`);
        }

        if (item.warningText && inc.warning) {
            lines.push('');
            lines.push(`\u26A0 Warning: ${item.warningText}`);
        }

        if (item.supplements.length > 0 && inc.supplements) {
            for (const supp of item.supplements) {
                lines.push('');
                lines.push(`Supplement Note: ${supp.reason}`);
                lines.push(`  Dosage: ${supp.dosage}`);
                if (supp.productName) {
                    lines.push(`  Recommended Product: ${supp.productName}${supp.productLink ? ` (${supp.productLink})` : ''}`);
                }
            }
        }

        if (item.notes) {
            lines.push(`Notes: ${item.notes}`);
        }

        lines.push('');
        lines.push('\u2501'.repeat(40));
    }

    if (includeSupplies) {
        lines.push('');
        lines.push('WHAT YOU\'LL NEED');
        lines.push('\u2501'.repeat(40));
        for (const s of RECOMMENDED_SUPPLIES) {
            lines.push(`\u2022 ${s.name}`);
            lines.push(`  ${s.description}`);
            lines.push(`  ${s.link}`);
            lines.push('');
        }
        lines.push(`\u25B6 How to Reconstitute Peptides (Video Guide)`);
        lines.push(`  ${RECONSTITUTION_VIDEO_URL}`);
    }

    lines.push('');
    lines.push('GENERAL GUIDELINES');
    lines.push('Storage: Refrigerate all reconstituted peptides. Keep away from heat and light.');
    lines.push('Syringes: Use 1 mL insulin syringes with 100 unit markings (U-100).');
    lines.push('Alcohol Swabs: Always clean the vial top and injection site before use.');
    lines.push('');
    lines.push('Questions? Reply to this email or reach out anytime.');
    lines.push('');
    lines.push(`\u2014 ${orgName}`);

    return lines.join('\n');
}
