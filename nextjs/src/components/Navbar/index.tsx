"use client";

import Link from "next/link";
import { Search } from "./search";

const Navbar = () => {
  return (
    <header className="navbar">
      <div>
        <div>
          <Link href="/" prefetch={false}>
            <img src="/logo.png" alt="website logo" />
          </Link>
          <Search />
          <nav>
            <ul>
              <li>
                <Link href="/letter/a" prefetch={false}>
                  Words
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
