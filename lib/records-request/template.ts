// Pure §119 public-records request draft. No I/O, no LLM — a fixed courteous
// request. Statute language verbatim from FL Stat. §119.07 (verified live 07/11/2026).

export interface DraftInput {
  targetAgency: string;
  dataset: string;
  statuteBasis?: string;
  requesterName?: string;
  requesterEmail?: string;
}

export function draftSubject(dataset: string): string {
  const short = dataset.length > 60 ? dataset.slice(0, 57).trimEnd() + "…" : dataset;
  return `Florida Public Records Request — ${short}`;
}

export function draftRequestBody(input: DraftInput): string {
  const {
    targetAgency,
    dataset,
    statuteBasis = "Fla. Stat. ch. 119",
    requesterName = "SWFL Data Gulf",
    requesterEmail = "hello@swfldatagulf.com",
  } = input;

  return [
    `To the Public Records Custodian, ${targetAgency}:`,
    ``,
    `Under Florida's Public Records Act (${statuteBasis}), I request access to and an ` +
      `electronic copy of the following public record:`,
    ``,
    dataset,
    ``,
    `To keep any cost to a minimum, electronic delivery (email, a download link, or a ` +
      `spreadsheet export) is preferred over paper copies.`,
    ``,
    `If fulfilling this request will require a special service charge under s. 119.07(4) ` +
      `(extensive use of information technology resources or extensive clerical or ` +
      `supervisory assistance), please provide a written cost estimate before proceeding ` +
      `so I can authorize it.`,
    ``,
    `If any portion of the requested record is exempt or confidential, please redact only ` +
      `that portion, produce the remainder, and state in writing the specific statutory ` +
      `basis for each exemption, as provided in s. 119.07(1).`,
    ``,
    `Thank you for your assistance.`,
    ``,
    requesterName,
    requesterEmail,
  ].join("\n");
}
