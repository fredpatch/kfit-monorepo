import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminCustomer } from "@kfit/shared";
import { customerErrorMessage, customersApi } from "../api/customers-api.js";

const channels: Record<string, string> = { whatsapp: "WhatsApp", phone_call: "Appel téléphonique", sms: "SMS", email: "E-mail", other: "Autre" };
const listKey = ["customers", "admin-list"] as const;

function CustomerTable({ customers }: { customers: AdminCustomer[] }) {
  return <div className="customers-table-scroll" role="region" aria-label="Tableau des clients" tabIndex={0}>
    <table className="customers-table">
      <caption className="muted">Clients actifs</caption>
      <thead><tr><th scope="col">Nom complet</th><th scope="col">WhatsApp</th><th scope="col">E-mail</th><th scope="col">Ville / Pays</th><th scope="col">Contact préféré</th><th scope="col">Créé le</th></tr></thead>
      <tbody>{customers.map(customer => <tr key={customer.id}>
        <th scope="row"><a href={`/admin/clients/${customer.id}`}>{customer.fullName}</a></th><td>{customer.whatsapp}</td><td>{customer.email ?? "—"}</td>
        <td>{[customer.city, customer.country].filter(Boolean).join(" / ") || "—"}</td>
        <td>{channels[customer.preferredContactChannel] ?? "Autre"}</td>
        <td><time dateTime={customer.createdAt}>{new Date(customer.createdAt).toLocaleDateString("fr-FR")}</time></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

export function AdminCustomersPage() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: listKey, queryFn: () => customersApi.list() });
  const [whatsapp, setWhatsapp] = useState("");
  const [result, setResult] = useState<{ whatsapp: string; customers: AdminCustomer[] } | null>(null);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const search = useMutation({ mutationFn: customersApi.search });
  const create = useMutation({ mutationFn: customersApi.create });
  const pending = search.isPending || create.isPending;

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null); setResult(null); setCreated(false);
    try {
      const response = await search.mutateAsync(whatsapp);
      setResult({ whatsapp, customers: response.customers });
    } catch (failure) { setError(customerErrorMessage(failure)); }
    finally { inFlight.current = false; }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !result || result.customers.length !== 0) return;
    inFlight.current = true;
    const data = new FormData(event.currentTarget);
    setError(null);
    try {
      const response = await create.mutateAsync({
        fullName: data.get("fullName"), whatsapp: result.whatsapp, email: data.get("email"),
        city: data.get("city"), country: data.get("country"), preferredContactChannel: data.get("preferredContactChannel"),
      });
      setResult({ whatsapp: result.whatsapp, customers: [response.customer] });
      setCreated(true);
      await queryClient.invalidateQueries({ queryKey: listKey });
    } catch (failure) { setError(customerErrorMessage(failure)); }
    finally { inFlight.current = false; }
  }

  return <section className="customers-page" aria-label="Gestion des clients">
    <section className="customers-panel" aria-labelledby="customer-search-title">
      <h2 id="customer-search-title">Rechercher un client</h2>
      <p className="muted">Recherche d’abord le numéro WhatsApp pour retrouver un client ou créer sa fiche.</p>
      <form className="customers-search" onSubmit={event => void handleSearch(event)}>
        <label htmlFor="customer-whatsapp">Numéro WhatsApp</label>
        <div className="customers-search-controls">
          <input id="customer-whatsapp" type="tel" autoComplete="tel" required maxLength={30} value={whatsapp} disabled={pending}
            onChange={event => { setWhatsapp(event.target.value); setResult(null); setCreated(false); setError(null); }} />
          <button type="submit" disabled={pending}>{search.isPending ? "Recherche…" : "Rechercher"}</button>
        </div>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {result && result.customers.length > 0 && <div aria-live="polite">
        <p className="status">{created ? "La fiche client a été créée." : "Client retrouvé."}</p>
        <CustomerTable customers={result.customers} />
      </div>}
      {result && result.customers.length === 0 && <div>
        <p className="status" role="status">Aucun client actif trouvé pour ce numéro.</p>
        <h3>Créer une fiche client</h3>
        <p className="muted">Numéro WhatsApp : {result.whatsapp}</p>
        <form className="customers-create" onSubmit={event => void handleCreate(event)} key={result.whatsapp}>
          <fieldset disabled={pending}>
            <legend>Coordonnées du client</legend>
            <label>Nom complet *<input name="fullName" autoComplete="name" required maxLength={200} /></label>
            <label>E-mail<input name="email" type="email" autoComplete="email" maxLength={254} /></label>
            <label>Ville<input name="city" autoComplete="address-level2" maxLength={200} /></label>
            <label>Pays<input name="country" autoComplete="country-name" maxLength={200} /></label>
            <label>Contact préféré<select name="preferredContactChannel" defaultValue="whatsapp">{Object.entries(channels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </fieldset>
          <button type="submit" disabled={pending}>{create.isPending ? "Création…" : "Créer le client"}</button>
        </form>
      </div>}
    </section>
    <section className="customers-panel" aria-labelledby="customer-list-title">
      <h2 id="customer-list-title">Clients</h2>
      {list.isPending && <p role="status">Chargement des clients…</p>}
      {list.isError && <div role="alert"><p className="error">{customerErrorMessage(list.error)}</p><button type="button" onClick={() => void list.refetch()}>Réessayer</button></div>}
      {list.isSuccess && (list.data.customers.length > 0 ? <CustomerTable customers={list.data.customers} /> : <p className="muted">Aucun client actif pour le moment.</p>)}
    </section>
  </section>;
}
