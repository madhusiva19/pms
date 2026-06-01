export async function GET() {
  try {
    const res = await fetch("/api/health", {
      cache: "no-store"
    });

    const data = await res.json();
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ error: "backend_unreachable" }, { status: 502 });
  }
}