import { SITE_NAME } from "@/lib/constants";

function Footer() {
  return (
    <footer className="footer">
      <div className="container-lg">
        <div>
          <span>{SITE_NAME}</span>
          <p>© {new Date().getFullYear()} All rights reserved.</p>
        </div>

        <nav className="footer-nav">
          <div>
            <p>Company</p>
            <ul>
              <li>
                <a href="/about">About</a>
              </li>
              <li>
                <a href="mailto:work.hahuaz@gmail.com">Contact</a>
              </li>
            </ul>
          </div>
          <div>
            <p>Legal</p>
            <ul>
              <li>
                <a href="/terms">Terms</a>
              </li>
            </ul>
          </div>
        </nav>
      </div>
    </footer>
  );
}

export default Footer;
