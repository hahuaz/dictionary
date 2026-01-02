import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <main>
        <section className="landing-section nf">
          <p>404</p>
          <h1>Page not found</h1>
          <p>Sorry, we couldn't find the page you're looking for.</p>
          <div>
            <Link href="/">Go back home</Link>
          </div>
        </section>
      </main>
    </>
  );
}
