import Link from "next/link";

const poaps = [
  { title: "ETHGlobal Bangkok", event: "ETHGlobal · Bangkok, Thailand", date: "NOV 2024", mark: "✳", type: "Ethereum" },
  { title: "Onchain Summer", event: "Base · Online", date: "AUG 2024", mark: "☼", type: "Summer" },
  { title: "Devcon SEA", event: "Ethereum Foundation · Bangkok", date: "NOV 2024", mark: "⌁", type: "Conference" },
  { title: "Build on Base", event: "Base · Singapore", date: "SEP 2024", mark: "◒", type: "Workshop" },
  { title: "FarCon 2024", event: "Farcaster · Venice, Italy", date: "JUN 2024", mark: "✳", type: "Community" },
  { title: "ZK House", event: "ZKsync · Denver, USA", date: "MAR 2024", mark: "◈", type: "Web3" },
];

const art = ["from-[#d1ef77] to-[#8dbd42]", "from-[#ffbe9b] to-[#ef785c]", "from-[#b8c8ff] to-[#7778d9]", "from-[#a4e2d2] to-[#4aa995]", "from-[#ffd78e] to-[#f09c4f]", "from-[#e2b7eb] to-[#a575ba]"];
const markColors = ["text-[#36531e]", "text-[#733c32]", "text-[#393477]", "text-[#23584e]", "text-[#744720]", "text-[#57365f]"];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-7xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <section className="relative overflow-hidden rounded-[28px] bg-[#20251d] px-6 py-9 text-white sm:px-10 sm:py-12 lg:px-14">
        <div className="pointer-events-none absolute -right-12 -top-32 h-80 w-80 rounded-full border border-white/[0.08] sm:right-14 sm:top-[-220px] sm:h-[540px] sm:w-[540px]" />
        <div className="pointer-events-none absolute right-[-8%] top-[-75%] h-[520px] w-[520px] rounded-full border border-white/[0.06]" />
        <div className="relative max-w-2xl">
          <div className="mb-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.19em] text-[#c6ed72]"><span className="h-1.5 w-1.5 rounded-full bg-[#c6ed72]" />Your onchain scrapbook</div>
          <h1 className="max-w-xl text-[38px] font-medium leading-[1.08] tracking-[-.055em] sm:text-[54px]">The moments you showed up <span className="font-serif italic text-[#c6ed72]">for.</span></h1>
          <p className="mt-4 max-w-md text-[14px] leading-6 text-white/60 sm:text-[15px]">A little collection of places you&apos;ve been, people you&apos;ve met, and things you&apos;ve built.</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
            <div><div className="text-[25px] font-semibold tracking-[-.05em]">06</div><div className="mt-1 text-[11px] text-white/45">POAPs collected</div></div>
            <div className="h-9 w-px bg-white/15" />
            <div><div className="text-[25px] font-semibold tracking-[-.05em]">04</div><div className="mt-1 text-[11px] text-white/45">Cities explored</div></div>
            <Link href="/admin" className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2.5 text-xs font-medium text-white/80 transition hover:border-[#c6ed72] hover:text-[#c6ed72]">Issue a POAP <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </section>

      <section className="pt-10 sm:pt-12" aria-labelledby="collection-heading">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><div className="text-[11px] font-semibold uppercase tracking-[.17em] text-muted">Collected moments</div><h2 id="collection-heading" className="mt-2 text-2xl font-semibold tracking-[-.05em]">Your collection <span className="ml-1 text-sm font-normal tracking-normal text-[#9da39a]">(06)</span></h2></div>
          <div className="flex gap-2 overflow-x-auto pb-1 text-xs font-medium">
            <button className="shrink-0 rounded-full bg-ink px-4 py-2.5 text-white">All badges</button><button className="shrink-0 rounded-full border border-black/[0.08] bg-white px-4 py-2.5 text-muted transition hover:border-black/20 hover:text-ink">Events</button><button className="shrink-0 rounded-full border border-black/[0.08] bg-white px-4 py-2.5 text-muted transition hover:border-black/20 hover:text-ink">Community</button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {poaps.map((poap, index) => (
            <article key={poap.title} className="group overflow-hidden rounded-[20px] border border-black/[0.06] bg-white transition duration-300 hover:-translate-y-1 hover:shadow-soft">
              <div className={`badge-art flex h-[190px] items-center justify-center bg-gradient-to-br ${art[index]} sm:h-[210px]`}>
                <div className="badge-ring grid h-[112px] w-[112px] place-items-center rounded-full border border-white/60 bg-white/20 backdrop-blur-sm transition duration-500 group-hover:rotate-[-8deg] group-hover:scale-105 sm:h-[124px] sm:w-[124px]">
                  <div className={`grid h-[88px] w-[88px] place-items-center rounded-full border border-white/70 bg-white/30 font-serif text-[56px] leading-none ${markColors[index]} sm:h-[98px] sm:w-[98px]`}>{poap.mark}</div>
                </div>
                <span className="absolute left-4 top-4 rounded-full border border-white/40 bg-white/20 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.15em] text-ink/70 backdrop-blur">{poap.type}</span>
                <span className="absolute right-4 top-4 text-[10px] font-semibold tracking-[.12em] text-ink/60">{poap.date}</span>
                <div className="absolute bottom-3 right-4 text-[9px] font-semibold uppercase tracking-[.13em] text-ink/45">GATHER · 00{index + 1}</div>
              </div>
              <div className="flex items-center justify-between gap-3 px-5 py-[17px]">
                <div className="min-w-0"><h3 className="truncate text-[14px] font-semibold tracking-[-.025em]">{poap.title}</h3><p className="mt-1 truncate text-[11px] text-muted">{poap.event}</p></div>
                <button aria-label={`View ${poap.title}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-black/[0.08] text-[#82877f] transition group-hover:border-ink group-hover:bg-ink group-hover:text-white"><svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M5.5 14.5 14.5 5.5M6 5.5h8.5V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <footer id="about" className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-black/[0.07] pt-5 text-[11px] text-muted sm:flex-row"><span>Every badge holds a story. Keep showing up.</span><span className="font-medium tracking-[-.03em] text-ink">gather<span className="text-[#9ccf3f]">.</span> · built for the moments</span></footer>
    </main>
  );
}
