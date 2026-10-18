import type { NextResponse } from "next/server";

import { getRepository } from "@/lib/repositories";
import { fileResponse, jsonError, withAuth } from "@/lib/services/api-helpers";
import { generateReportPdf } from "@/lib/services/report-document";
import { getReportDetail, recordReportExport } from "@/lib/services/report-service";

/**
 * GET /api/reports/[id]/export.pdf — generates a real PDF with pdf-lib.
 *
 * Observations and AI-generated interpretation are rendered as separate
 * sections, limitations are mandatory, and a simulated report carries a
 * provenance notice on the cover and in every page footer.
 */
export const GET = withAuth(
  "reports:export",
  async (
    { auth, requestId },
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await context.params;
    const report = await getReportDetail(auth, id);

    if (!report) {
      return jsonError("NOT_FOUND", `No report was found for "${id}".`, 404, requestId);
    }

    const repository = await getRepository();
    const [organisation, contact, includeAudit] = await Promise.all([
      repository.getSetting("application.organisationName"),
      repository.getSetting("application.contactEmail"),
      repository.getSetting("reportDefaults.includeAuditTrail"),
    ]);

    const pdf = await generateReportPdf(report, {
      includeAuditTrail: includeAudit?.value === true,
      organisationName:
        typeof organisation?.value === "string" ? organisation.value : "Sentinel",
      contactEmail: typeof contact?.value === "string" ? contact.value : "not configured",
    });

    await recordReportExport(auth, id, "pdf", requestId);

    return fileResponse(pdf.bytes, {
      filename: pdf.filename,
      contentType: "application/pdf",
      requestId,
    });
  },
);
