import { handleTts } from '../../server/sage.js';

export function GET(request: Request) {
  return handleTts(request, process.env);
}
