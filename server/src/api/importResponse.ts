import type { Response } from "express";
import { applyImport, type ImportPlan } from "../services/listingImport";

/** The report both the API and the CSV import answer with. */
export function importReport(plan: ImportPlan, committed: boolean) {
  return { committed, counts: plan.counts, rows: plan.rows };
}

/**
 * Plans, and unless it's a dry run, writes. With errors and no skipInvalid,
 * nothing is written and the answer is 422 with the full report.
 */
export async function runImport(
  res: Response,
  accountId: string,
  plan: ImportPlan,
  { dryRun, skipInvalid }: { dryRun: boolean; skipInvalid: boolean },
): Promise<boolean> {
  if (dryRun) {
    res.json(importReport(plan, false));
    return false;
  }
  if (plan.counts.error && !skipInvalid) {
    res.status(422).json({ error: "IMPORT_HAS_ERRORS", ...importReport(plan, false) });
    return false;
  }
  await applyImport(accountId, plan);
  res.json(importReport(plan, true));
  return true;
}
