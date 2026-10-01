import { handleLine } from '../../server/sage.js';

export function POST(request: Request) {
  return handleLine(request, process.env);
}
