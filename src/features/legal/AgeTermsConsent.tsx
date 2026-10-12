import { Link } from "react-router-dom";
import { Trans } from "react-i18next";
import { FormFeedback, FormGroup, Input, Label } from "reactstrap";

const linkStyle = { textUnderlineOffset: 2 } as const;
const links = {
  terms: <Link to="/terms" target="_blank" style={linkStyle} />,
  privacy: <Link to="/privacy" target="_blank" style={linkStyle} />,
};

/**
 * "I am 18 or over and accept the Terms and the Privacy Policy" — the box
 * signing up asks to be ticked, for the email form and Google alike.
 *
 * The two pages open in a new tab, so reading them does not lose what was
 * typed into the form.
 */
export function AgeTermsConsent({ checked, onChange, invalid }: { checked: boolean; onChange: (checked: boolean) => void; invalid: boolean }) {
  return (
    <FormGroup check className="mb-3">
      <Input id="age-terms" type="checkbox" checked={checked} invalid={invalid} onChange={(e) => onChange(e.target.checked)} />
      <Label for="age-terms" check className="small">
        <Trans i18nKey="legal.consent" components={links} />
      </Label>
      <FormFeedback>
        <Trans i18nKey="legal.consentNeeded" />
      </FormFeedback>
    </FormGroup>
  );
}

/** The same, said rather than asked: signing in can also create an account, through Google. */
export function AgeTermsNotice() {
  return (
    <p className="text-center small text-body-secondary mt-3 mb-0">
      <Trans i18nKey="legal.signInNotice" components={links} />
    </p>
  );
}
