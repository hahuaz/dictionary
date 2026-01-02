import React from "react";

import { SITE_NAME } from "@/lib/constants";

export default function Terms() {
  const sectionStyle: React.CSSProperties = {
    width: "100%",
    padding: "16px",
    boxSizing: "border-box",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  };

  const containerStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "900px",
    boxSizing: "border-box",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: "2rem", // mobile-first
    fontWeight: 700,
    marginBottom: "1rem",
    lineHeight: 1.2,
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: "1.5rem",
    fontWeight: 600,
    marginTop: "1.5rem",
    marginBottom: "0.75rem",
    lineHeight: 1.3,
  };

  const paragraphStyle: React.CSSProperties = {
    marginBottom: "1rem",
    fontSize: "1rem",
    lineHeight: 1.6,
  };

  return (
    <section className="landing-section" style={sectionStyle}>
      <div style={containerStyle}>
        <h1 style={titleStyle}>Terms of Service</h1>

        <p style={paragraphStyle}>
          Welcome to {SITE_NAME}! By accessing or using our site, you agree to
          the following terms and conditions.
        </p>

        <h2 style={subtitleStyle}>1. Acceptance of Terms</h2>
        <p style={paragraphStyle}>
          By using our website, you agree to comply with these terms. If you do
          not agree, please do not use the site.
        </p>

        <h2 style={subtitleStyle}>2. User Responsibilities</h2>
        <p style={paragraphStyle}>
          You agree to use the website only for lawful purposes and refrain from
          harmful activities like spamming or hacking.
        </p>

        <h2 style={subtitleStyle}>3. Intellectual Property</h2>
        <p style={paragraphStyle}>
          All content on this site is owned by {SITE_NAME} and protected by
          copyright laws. Do not use content without permission.
        </p>

        <h2 style={subtitleStyle}>4. Liability Disclaimer</h2>
        <p style={paragraphStyle}>
          We are not liable for any damages arising from the use of our site or
          content.
        </p>

        <h2 style={subtitleStyle}>5. Termination</h2>
        <p style={paragraphStyle}>
          We reserve the right to terminate or suspend your access to the
          website for violations of these terms.
        </p>

        <h2 style={subtitleStyle}>6. Changes to Terms</h2>
        <p style={paragraphStyle}>
          We may modify these terms at any time. Continued use of the site
          constitutes acceptance of the updated terms.
        </p>
      </div>
    </section>
  );
}
