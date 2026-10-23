import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Rsc() {
  // Server-side fetches: should show up under Server origin; the tagged one also in the Cache tab.
  const a = await fetch('http://localhost:3100/api/demo', { cache: 'no-store' }).then((r) => r.json());
  const b = await fetch('http://localhost:3100/api/demo?status=200', { next: { tags: ['demo'], revalidate: 60 } }).then((r) => r.json());
  return (
    <main>
      <h1>RSC</h1>
      <p>{String(a.ok)} {String(b.ok)}</p>
      <Link href="/">Home</Link>
    </main>
  );
}
