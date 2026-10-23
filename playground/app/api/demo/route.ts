import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (q.get('big')) {
    // ~5 MB JSON with a 10,000 char string and a 5,000 item array
    const items = Array.from({ length: 5000 }, (_, i) => ({ id: i, name: `item-${i}`, payload: 'x'.repeat(900) }));
    return Response.json({ long: 'y'.repeat(10_000), items });
  }
  const status = Number(q.get('status') ?? 200);
  return Response.json(
    { ok: status < 400, user: { id: 1, name: "O'Brien\nnewline é🚀", token: 'super-secret-token' }, list: [1, 2, 3] },
    { status },
  );
}

export async function POST(req: Request) {
  const body = await req.text();
  return Response.json({ echoed: body, password: 'hunter2' }, { status: 409 });
}
