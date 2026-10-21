import { useState } from "react";
import { requiredConsentTypes, type ConsentDecisions, type ConsentDefinition } from "@kfit/shared";
export function ConsentDecisionsForm({ definitions, disabled, coach = false, onSubmit }: { definitions: ConsentDefinition[]; disabled: boolean; coach?: boolean; onSubmit: (decisions: ConsentDecisions) => Promise<void> }) {
  const [terms, setTerms] = useState(""); const [privacy, setPrivacy] = useState(""); const [confirmed, setConfirmed] = useState(false);
  return <form className="consent-form" onSubmit={event => { event.preventDefault(); if ((terms === "granted" || terms === "refused") && (privacy === "granted" || privacy === "refused")) void onSubmit({ service_terms: terms, privacy_notice: privacy }); }}>
    {requiredConsentTypes.map(type => {
      const definition = definitions.find(d => d.consentType === type); if (!definition) return null;
      return <fieldset key={definition.id} disabled={disabled}><legend>{definition.title} — version {definition.version}</legend>
        <p className="consent-text">{definition.content}</p>
        <label><input type="radio" name={type} required value="granted" checked={(type === "service_terms" ? terms : privacy) === "granted"} onChange={() => (type === "service_terms" ? setTerms : setPrivacy)("granted")} />{coach ? "Accord recueilli" : "J’accepte"}</label>
        <label><input type="radio" name={type} required value="refused" checked={(type === "service_terms" ? terms : privacy) === "refused"} onChange={() => (type === "service_terms" ? setTerms : setPrivacy)("refused")} />{coach ? "Refus recueilli" : "Je refuse"}</label>
      </fieldset>;
    })}
    {coach && <label><input type="checkbox" required disabled={disabled} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Je confirme avoir présenté ces versions et recueilli séparément ces deux décisions auprès du client.</label>}
    <button type="submit" disabled={disabled || !terms || !privacy || (coach && !confirmed)}>{disabled ? "Enregistrement…" : coach ? "Enregistrer les décisions recueillies" : "Enregistrer mes choix"}</button>
  </form>;
}
