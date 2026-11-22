import { createCodingService } from '../../lib/office-coding.mjs';
// Deliberately unconnected. Existing chat unlock is NOT a coding authorization.
// No environment switch, mailbox credential or arbitrary endpoint enables execution.
// Wire only after review of owner authentication, atomic private storage, scoped
// runner permissions and provider-specific adapters. See docs/OFFICE_CODING.md.
const handle = createCodingService();
export const onRequestGet = ({ request }) => handle(request);
export const onRequestPost = ({ request }) => handle(request);
