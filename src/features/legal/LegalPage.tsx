import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiArrowLeft, FiBriefcase } from "react-icons/fi";
import { LEGAL_CONTACT_URL, LEGAL_UPDATED, legalText, type LegalDoc } from "./legalContent";
import { LegalLinks } from "./LegalLinks";
import styles from "./css/Legal.module.css";

/**
 * The terms or the privacy policy, readable signed in or not.
 *
 * Outside the app's shell on purpose: these are linked from the sign-in and
 * sign-up pages, where there is no menu to show, and a page of prose reads
 * best as a single narrow column anyway.
 */
export default function LegalPage({ doc }: { doc: LegalDoc }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const text = legalText(doc, i18n.resolvedLanguage);
  const updated = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "numeric", month: "long", year: "numeric" }).format(LEGAL_UPDATED);

  useEffect(() => {
    document.title = `${text.title} · MyFiWallet`;
    window.scrollTo(0, 0);
  }, [text.title]);

  // Back to wherever the link was — the footer, the sign-in page — or home
  // when the page was opened on its own.
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          <span className={styles.logo} aria-hidden>
            <FiBriefcase />
          </span>
          MyFiWallet
        </Link>
        <button type="button" className={styles.back} onClick={back}>
          <FiArrowLeft aria-hidden /> {t("legal.back")}
        </button>
      </header>

      <main className={styles.body}>
        <h1 className={styles.title}>{text.title}</h1>
        <p className={styles.updated}>{t("legal.updated", { date: updated })}</p>
        <p className={styles.intro}>{text.intro}</p>

        {text.sections.map((section) => (
          <section key={section.heading} className={styles.section}>
            <h2 className={styles.heading}>{section.heading}</h2>
            {section.items && (
              <ul className={styles.list}>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}

        <p className={styles.contact}>
          {t("legal.contact")}{" "}
          <a href={LEGAL_CONTACT_URL} target="_blank" rel="noopener noreferrer">
            igiontisportfolio.netlify.app
          </a>
        </p>
      </main>

      <footer className={styles.footer}>
        <LegalLinks />
      </footer>
    </div>
  );
}
