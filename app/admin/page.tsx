"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export default function AdminPage() {
  const [eventName, setEventName] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <main className="mx-auto max-w-7xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <div className="mb-8 flex items-center gap-2 text-xs text-muted"><Link href="/" className="transition hover:text-ink">Home</Link><span>/</span><span className="text-ink">Issue a POAP</span></div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
        <section>
          <div className="mb-8"><div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#eef5df] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.15em] text-[#59762c]"><span className="h-1.5 w-1.5 rounded-full bg-[#91b842]" />Organizer studio</div><h1 className="text-[38px] font-medium leading-tight tracking-[-.06em] sm:text-[48px]">Make it <span className="font-serif italic text-[#8db23e]">memorable.</span></h1><p className="mt-3 max-w-lg text-sm leading-6 text-muted">Create a badge for the people who made your event what it was. They&apos;ll carry it with them, onchain.</p></div>
          <form onSubmit={handleSubmit} onChange={() => setSubmitted(false)} className="rounded-[22px] border border-black/[0.07] bg-white p-5 shadow-[0_8px_30px_rgba(24,32,19,.035)] sm:p-8">
            <div className="mb-7 flex items-center justify-between border-b border-black/[0.07] pb-5"><div><h2 className="text-[15px] font-semibold tracking-[-.03em]">Badge details</h2><p className="mt-1 text-xs text-muted">A few details to get started</p></div><span className="text-[10px] font-medium text-muted">01 <span className="mx-1 text-black/20">/</span> 02</span></div>
            <div className="space-y-5">
              <label className="block"><span className="mb-2 block text-xs font-semibold">Event name <span className="text-[#e87560]">*</span></span><input required name="eventName" value={eventName} onChange={(event) => setEventName(event.target.value)} placeholder="e.g. Community meetup #12" className="w-full rounded-xl border border-black/[0.1] bg-[#fdfdfc] px-4 py-3 text-sm outline-none transition placeholder:text-[#b1b5ad] focus:border-[#91b842] focus:ring-4 focus:ring-[#91b842]/10" /></label>
              <label className="block"><span className="mb-2 block text-xs font-semibold">Description <span className="text-[#e87560]">*</span></span><textarea required name="description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="What made this gathering special?" className="w-full resize-none rounded-xl border border-black/[0.1] bg-[#fdfdfc] px-4 py-3 text-sm outline-none transition placeholder:text-[#b1b5ad] focus:border-[#91b842] focus:ring-4 focus:ring-[#91b842]/10" /></label>
              <div className="grid gap-5 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-xs font-semibold">Event date <span className="text-[#e87560]">*</span></span><input required name="eventDate" type="date" className="w-full rounded-xl border border-black/[0.1] bg-[#fdfdfc] px-4 py-3 text-sm text-muted outline-none transition focus:border-[#91b842] focus:ring-4 focus:ring-[#91b842]/10" /></label><label className="block"><span className="mb-2 block text-xs font-semibold">Network</span><select name="network" defaultValue="base" className="w-full rounded-xl border border-black/[0.1] bg-[#fdfdfc] px-4 py-3 text-sm text-ink outline-none transition focus:border-[#91b842] focus:ring-4 focus:ring-[#91b842]/10"><option value="base">Base</option><option value="optimism">Optimism</option><option value="polygon">Polygon</option><option value="gnosis">Gnosis Chain</option></select></label></div>
              <label className="block"><span className="mb-2 block text-xs font-semibold">Badge artwork <span className="text-[#e87560]">*</span></span><input required name="artwork" type="file" accept="image/*" className="w-full rounded-xl border border-dashed border-black/15 bg-[#fdfdfc] px-4 py-3 text-xs text-muted file:mr-3 file:rounded-full file:border-0 file:bg-[#eef5df] file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-[#59762c]" /><span className="mt-2 block text-[10px] text-[#9a9f97]">Square image recommended · PNG, JPG or GIF · max 5 MB</span></label>
              <div className="flex flex-col-reverse gap-3 border-t border-black/[0.07] pt-6 sm:flex-row sm:items-center sm:justify-between"><button type="button" className="rounded-full px-5 py-3 text-xs font-semibold text-muted transition hover:bg-black/[0.04]">Save as draft</button><button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 text-xs font-semibold text-white transition hover:bg-[#343a31]">Issue POAP <span aria-hidden="true">→</span></button></div>
              {submitted && <p role="status" className="rounded-xl bg-[#eef5df] px-4 py-3 text-xs font-medium text-[#59762c]">POAP created in demo mode. Connect a wallet and minting contract to issue it onchain.</p>}
            </div>
          </form>
        </section>
        <aside className="lg:pt-[75px]">
          <div className="sticky top-8 rounded-[22px] border border-black/[0.07] bg-white p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between"><div className="text-[11px] font-semibold uppercase tracking-[.15em] text-muted">Live preview</div><span className="rounded-full bg-[#f2f3ef] px-2.5 py-1 text-[9px] font-medium text-muted">UNPUBLISHED</span></div>
            <div className="badge-art flex h-[245px] items-center justify-center rounded-[15px] bg-gradient-to-br from-[#d1ef77] to-[#8dbd42]">
              <div className="badge-ring grid h-[126px] w-[126px] place-items-center rounded-full border border-white/60 bg-white/20 backdrop-blur-sm"><div className="grid h-[100px] w-[100px] place-items-center rounded-full border border-white/70 bg-white/30 font-serif text-[62px] text-[#36531e]">✳</div></div>
              <span className="absolute bottom-3 right-3 text-[9px] font-semibold uppercase tracking-[.13em] text-ink/45">GATHER · PREVIEW</span>
            </div>
            <div className="pt-4"><div className="text-sm font-semibold tracking-[-.025em]">{eventName || "Your event name"}</div><p className="mt-1 text-[11px] text-muted">{description || "Your description will appear here"}</p></div>
            <div className="mt-5 rounded-xl bg-[#f6f7f4] p-4"><div className="flex gap-3"><span className="mt-0.5 text-[#8db23e]">✦</span><p className="text-[10px] leading-[1.65] text-muted">Your POAP will be minted as a digital collectible. Attendees can claim it and keep it in their wallet forever.</p></div></div>
          </div>
          <p className="mt-4 text-center text-[10px] text-muted">Need a hand? <a href="mailto:hello@gather.xyz" className="font-semibold text-ink underline decoration-black/20 underline-offset-2">Talk to our team</a></p>
        </aside>
      </div>
    </main>
  );
}
