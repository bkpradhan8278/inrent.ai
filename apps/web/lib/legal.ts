import type { LegalSection } from "@/components/marketing/legal-page";

const UPDATED = "2026-10-03";

export const LEGAL = {
  terms: {
    title: "Terms of Service",
    updated: UPDATED,
    intro: "These Terms govern access to and use of the INRENT website, dashboard, API, SDKs, CLI and related services (the \"Services\"). By creating an account or using the Services you agree to these Terms.",
    sections: [
      { title: "Accounts", body: ["You must provide accurate information and keep credentials and API keys confidential. You are responsible for activity under your account and keys, including usage by members of your organization.", "You must be old enough to form a binding contract in your jurisdiction. If you use the Services on behalf of an organization, you represent that you are authorized to bind it."] },
      { title: "The Services", body: ["INRENT provides an API that routes requests to third-party and INRENT-operated AI models. Model availability, capabilities and pricing change over time and are shown in the catalog.", "Features labelled preview, beta or coming soon (including GPU Cloud, agent runtime and MCP tool execution) may be incomplete, change or be withdrawn."] },
      { title: "Model provider terms and licenses", body: ["Models are made available under their providers' terms and the applicable model and weights licenses. You must comply with those terms, including acceptable-use requirements, when using a model through INRENT.", "INRENT offers platform-funded access to a provider's models only where the provider's terms or an agreement with INRENT permit it. Where they do not, access is available only with your own provider credentials (\"BYOK\"), and your agreement with that provider governs that usage.", "Open-weight models served by INRENT are enabled only after license review. License information is shown per model; where it is marked unverified, commercial use through INRENT is not offered."] },
      { title: "Commercial use and resale", body: ["You may use outputs in your own products subject to the applicable model licenses and provider terms. You may not resell or sublicense access to the Services, or provide a competing API by wrapping the Services, without a written agreement with INRENT."] },
      { title: "Credits, fees and payment", body: ["Usage is charged from prepaid credits at the prices shown for each model at the time of the request, which include INRENT's platform fee. Charges are calculated by INRENT from provider-reported usage.", "Payments are processed by our payment providers. Auto-recharge runs only if you enable it. Taxes may apply. Refunds of unused credits are handled under the refund policy in effect at the time of purchase.", "We may suspend requests that would exceed your balance, budgets or limits."] },
      { title: "Customer content", body: ["You retain your rights in inputs you submit and outputs you receive (\"Customer Content\"), subject to provider terms. You grant INRENT the rights needed to operate the Services, including transmitting Customer Content to the providers that serve your requests.", "INRENT does not use Customer Content to train models. Logging of prompts and responses is off by default and controlled by your organization's settings."] },
      { title: "Acceptable use", body: ["You must follow the Acceptable Use Policy, which forms part of these Terms. We may investigate and act on suspected violations, including by suspending keys or accounts."] },
      { title: "Intellectual property and copyright", body: ["INRENT and its licensors own the Services. Feedback may be used without obligation. If you believe content processed through the Services infringes your copyright, contact us with the details required by applicable law."] },
      { title: "Suspension and termination", body: ["You may close your account at any time. We may suspend or terminate access for breach of these Terms, non-payment, security risk, legal requirements or provider requirements, with notice where reasonable.", "On termination we delete or anonymize account data as described in the Privacy Policy, retaining records we must keep for legal, tax and accounting purposes."] },
      { title: "Disclaimers and limitation of liability", body: ["AI outputs may be inaccurate or inappropriate; you are responsible for reviewing them before use. Except as expressly stated, the Services are provided \"as is\". To the extent permitted by law, INRENT's aggregate liability is limited to the amounts you paid in the twelve months before the claim."] },
      { title: "Changes and contact", body: ["We may update these Terms; material changes will be notified in advance where required. Questions: legal@inrent.ai."] },
    ] satisfies LegalSection[],
  },
  privacy: {
    title: "Privacy Policy",
    updated: UPDATED,
    intro: "This policy explains what personal data INRENT collects, why, how long we keep it and the choices you have.",
    sections: [
      { title: "Data we collect", body: ["Account data: name, email address, phone number if you sign in with one (sent to our SMS provider to deliver sign-in codes), authentication identifiers (including from GitHub, Google or OpenAI if you sign in with them) and organization membership.", "Billing data: payment status and amounts. Card details are handled by our payment processors and are not stored by INRENT.", "API usage metadata: request IDs, timestamps, model, provider, token counts, cost, latency, routing decisions, API key identifiers and a one-way hash of the client IP address.", "Prompts and responses: not stored by default. Stored only if an organization owner enables prompt or response logging, and deleted according to the organization's retention setting."] },
      { title: "How we use data", body: ["To provide and secure the Services, authenticate users, route and bill requests, prevent abuse and fraud, provide support, and meet legal obligations. We do not sell personal data and do not use Customer Content to train models."] },
      { title: "Model providers", body: ["To serve a request, INRENT sends the request content to the selected model provider. Providers process that content under their own terms and privacy policies. BYOK requests are processed under your own agreement with the provider."] },
      { title: "Retention", body: ["Request metadata is retained for your organization's log retention period (configurable per plan), then deleted; aggregated usage and billing records are retained as required for accounting. Payload logs follow your retention setting, and zero-retention mode prevents storage entirely.", "Deleted accounts are anonymized; financial records are kept only as long as legally required."] },
      { title: "Security", body: ["API keys are stored as keyed hashes; provider keys and webhook secrets are encrypted with AES-256-GCM; access is role-based and audited. See the Security page for details."] },
      { title: "Your rights", body: ["Depending on your location you may have rights to access, correct, export, delete or restrict processing of your personal data. Use the dashboard export and account deletion tools, or contact privacy@inrent.ai."] },
      { title: "International transfers", body: ["Data may be processed in countries other than your own, including by model providers. Where required we use appropriate safeguards such as standard contractual clauses."] },
      { title: "Contact", body: ["privacy@inrent.ai"] },
    ] satisfies LegalSection[],
  },
  acceptableUse: {
    title: "Acceptable Use Policy",
    updated: UPDATED,
    intro: "This policy describes uses of INRENT that are not allowed. It applies in addition to the usage policies of each model provider.",
    sections: [
      { title: "Prohibited content and activities", body: ["Illegal activity; content that sexualizes minors; violent extremism; harassment; malware creation or deployment; fraud, phishing or impersonation; non-consensual intimate imagery; and anything prohibited by the provider of the model you use."] },
      { title: "Security abuse", body: ["Attempting to bypass authentication, rate limits, budgets or billing; probing or attacking INRENT or provider infrastructure; using webhooks or MCP connections to reach systems you are not authorized to access."] },
      { title: "Platform abuse", body: ["Credential sharing or resale, automated account creation, scraping the Services at abusive volumes, chargeback fraud, and using the Services to build a competing resold API without agreement."] },
      { title: "High-risk use", body: ["Do not rely on AI outputs as the sole basis for decisions with legal or similarly significant effects (for example medical, legal, financial or employment decisions) without appropriate human review."] },
      { title: "Enforcement and reporting", body: ["We may throttle, suspend or terminate keys or accounts that violate this policy and may report illegal activity. Report abuse to abuse@inrent.ai or via the support form."] },
    ] satisfies LegalSection[],
  },
  cookies: {
    title: "Cookie Policy",
    updated: UPDATED,
    intro: "INRENT uses a small number of cookies that are necessary for the Services to work.",
    sections: [
      { title: "Strictly necessary cookies", body: ["Session cookies keep you signed in (prefixed inrent.). Preference cookies remember your active organization and project (inrent_org, inrent_project). These are required and do not track you across other sites."] },
      { title: "Local storage", body: ["We store small preferences in your browser, such as your preferred code language in the docs."] },
      { title: "Analytics and advertising", body: ["We do not use third-party advertising cookies. If we introduce analytics that require consent, we will ask first."] },
    ] satisfies LegalSection[],
  },
  dpa: {
    title: "Data Processing Addendum",
    updated: UPDATED,
    intro: "This Data Processing Addendum (\"DPA\") forms part of the Terms between the customer (controller) and INRENT (processor) for personal data processed through the Services.",
    sections: [
      { title: "Scope and roles", body: ["INRENT processes Customer Personal Data only on documented instructions from the customer, as needed to provide the Services. Model providers that serve platform-funded requests act as INRENT's sub-processors; for BYOK requests, the provider acts under the customer's own agreement."] },
      { title: "Processing details", body: ["Subject matter: provision of the Services. Duration: the term of the agreement. Nature and purpose: routing, metering, logging and support. Data subjects and categories: as contained in Customer Content and account data."] },
      { title: "Security measures", body: ["Encryption in transit and at rest for secrets, hashed API keys, role-based access control, audit logging, configurable retention including zero-retention mode, and incident response procedures."] },
      { title: "Sub-processors", body: ["INRENT maintains a list of sub-processors (infrastructure, payment and enabled model providers) and will give notice of changes so the customer can object."] },
      { title: "Assistance, deletion and audits", body: ["INRENT will assist with data-subject requests and impact assessments, delete or return data at the end of the Services, and make information available to demonstrate compliance."] },
      { title: "International transfers", body: ["Where data is transferred internationally, the parties rely on appropriate transfer mechanisms such as standard contractual clauses."] },
    ] satisfies LegalSection[],
  },
};
