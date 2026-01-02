import { Mail, Volume2 } from "lucide-react";
import { SITE_NAME } from "@/lib/constants";
import "./about.scss";

export default function AboutPage() {
  return (
    <div className="about">
      <main>
        <section className="landing-section">
          <div className="container">
            <div className="layout">
              <div className="content">
                <div className="badge-muted">About us</div>
                <h2 className="title">How it all began</h2>
                <p className="description">
                  We're on a mission to make language learning more accessible
                  and effective.
                </p>

                <div className="text-block">
                  <p>
                    {SITE_NAME} was born from a simple observation: language
                    learners struggle to understand how words are used in
                    everyday language.
                  </p>
                  <p>
                    While traditional tools focus on definitions, they often
                    lack the necessary examples of natural usage.
                  </p>
                  <p>
                    The site was launched to address this gap, offering
                    real-world examples and audio pronunciation for deeper
                    learning.
                  </p>
                </div>
              </div>

              <div className="illustration-wrapper">
                <div className="illustration">
                  <Volume2 className="icon-main" />
                  <div className="icon-bubble bubble-1">
                    <Volume2 />
                  </div>
                  <div className="icon-bubble bubble-2">
                    <Volume2 />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="contact-section bg__muted">
          <div className="container">
            <div className="max-content">
              <div className="layout">
                <div className="content">
                  <div className="badge-muted">Get in Touch</div>
                  <h2 className="title">We'd love to hear from you</h2>
                  <p className="description">
                    Have questions, feedback, or suggestions? We're always
                    looking to improve and would love to hear your thoughts.
                  </p>

                  <div className="contact-list">
                    <p className="contact-item">
                      <Mail className="icon-mail" />
                      <span>work.hahuaz@gmail.com</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
