"use client";

import { useState } from "react";
import type { EmergencyContact } from "@/lib/types";
import { createEmergencyContact, deleteEmergencyContact, notifyEmergencyContact } from "@/lib/api";

interface Props {
  contacts: EmergencyContact[];
  onRefresh: () => void;
}

export function EmergencyContacts({ contacts, onRefresh }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("neighbor");
  const [notifying, setNotifying] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await createEmergencyContact({
      name: name.trim(),
      phone_e164: phone.trim() || undefined,
      email: email.trim() || undefined,
      relationship,
    });
    setName(""); setPhone(""); setEmail(""); setShowAdd(false);
    onRefresh();
  }

  async function handleDelete(id: string) {
    await deleteEmergencyContact(id);
    onRefresh();
  }

  async function handleNotify(contactId?: string) {
    setNotifying(contactId ?? "all");
    try {
      await notifyEmergencyContact(contactId);
    } finally {
      setNotifying(null);
    }
  }

  return (
    <div className="ec-section">
      <div className="ec-header">
        <h3>Emergency Contacts</h3>
        <div className="ec-header-actions">
          <button
            className="ec-notify-all-btn"
            disabled={contacts.length === 0 || notifying === "all"}
            onClick={() => handleNotify()}
          >
            {notifying === "all" ? "Notifying..." : "Notify All"}
          </button>
          <button className="ec-add-btn" onClick={() => setShowAdd(!showAdd)}>+</button>
        </div>
      </div>

      {showAdd && (
        <form className="ec-add-form" onSubmit={handleAdd}>
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="Phone (e.164)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select value={relationship} onChange={(e) => setRelationship(e.target.value)}>
            <option value="neighbor">Neighbor</option>
            <option value="grandparent">Grandparent</option>
            <option value="family_friend">Family Friend</option>
            <option value="coworker">Coworker</option>
            <option value="other">Other</option>
          </select>
          <button type="submit" className="ops-button">Add</button>
        </form>
      )}

      <div className="member-cards">
        {contacts.length === 0 ? (
          <p className="muted-text">No emergency contacts added.</p>
        ) : (
          contacts.map((contact) => (
            <div key={contact.id} className="member-card">
              <div className="member-card-avatar" style={{ borderColor: "#F59E0B" }}>
                <span>{contact.name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "?"}</span>
              </div>
              <div className="member-card-info">
                <div className="member-card-top">
                  <span className="member-card-name">{contact.name}</span>
                  <span className="member-card-role" style={{ color: "#F59E0B" }}>
                    {contact.relationship.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="member-card-meta">
                  {contact.phone_e164 && <span>📱 {contact.phone_e164}</span>}
                  {contact.email && <span>✉️ {contact.email}</span>}
                </div>
              </div>
              <div className="ec-card-actions">
                <button
                  className="mini-button"
                  disabled={notifying === contact.id}
                  onClick={() => handleNotify(contact.id)}
                >
                  {notifying === contact.id ? "..." : "Notify"}
                </button>
                <button className="ec-delete-btn" onClick={() => handleDelete(contact.id)}>×</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
