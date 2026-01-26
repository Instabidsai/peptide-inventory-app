# GEMINI.md - project-level Agent Protocols

This file contains critical instructions for any AI agent working on the **Peptide Inventory App**. 
**YOU MUST READ THIS BEFORE MAKING CHANGES.**

## 1. 🚨 CRITICAL: "Zero-Crash" Policy
The application has experienced crashes due to missing imports and bad hook usage. 
**BEFORE you confirm a task is complete, you MUST:**

### A. Verify Imports
- If you copy-paste code (especially hooks like `useDeleteMovement`, `useToast`), **CHECK THE IMPORTS**.
- Do not assume imports are auto-added.

### B. Run Build Check
- **Mandatory Step**: Run `npm run build` locally before asking the user to deploy.
- If the build fails, **DO NOT PUSH**. Fix the errors first.

### C. Smoke Test
- Navigate to the page you just edited using the browser tool.
- Click the buttons you added/modified.
- Ensure the page renders without a blank white screen.

## 2. 🏛️ Architecture Overview
- **Backend**: Supabase (PostgreSQL + Edge Functions).
- **Frontend**: distinct pages in `src/pages`.
- **State Management**: React Query (`@tanstack/react-query`).
- **Styling**: Tailwind CSS + shadcn/ui.

## 3. 📦 Database & Schema
- **Orders**: Pending inventory not yet received.
- **Lots**: Physical groups of vials (Inventory).
- **Bottles**: Individual tracked units (linked to Lots).
- **Movements**: Transactions (Sales, Giveaways) that move Bottles out of stock.
- **Client Inventory**: "Digital Fridge" for contacts.

## 4. ⚠️ Known Pitfalls
- **`useDeleteMovement`**: This hook deletes a movement AND restores bottles to `in_stock`. Ensure it is imported correctly.
- **Context Errors**: Do not use `DialogTitle` inside `AlertDialog`. Use `AlertDialogTitle`.
- **RLS Policies**: If a query returns empty data unexpectedly, check Row Level Security policies on Supabase.

## 5. 📝 Task Management
- Always update `task.md` and `walkthrough.md` in the `.gemini/...` directory.
- Keep the user informed of *exactly* what you are doing (e.g., "Running build check...").
