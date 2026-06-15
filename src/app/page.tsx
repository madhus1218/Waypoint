import { ArrowRight, Camera, Map, Sparkles, Route } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#07130f] text-white">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">
        <nav className="flex items-center">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500">
              <Route className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">Waypoint</span>
          </div>
        </nav>

        <div className="grid flex-1 items-center gap-12 py-20 md:grid-cols-2">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200">
              <Sparkles className="h-4 w-4" />
              AI-powered travel memories
            </div>

            <h1 className="max-w-3xl text-5xl font-bold leading-tight tracking-tight md:text-7xl">
              Turn your photos into animated travel histories.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Waypoint analyzes photo metadata, detects trips from location
              patterns, and transforms your memories into interactive maps,
              timelines, and shareable route animations.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/upload"
                className="flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-7 py-3 font-semibold text-white transition hover:bg-emerald-400">
                Start mapping
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur">
            <div className="rounded-[1.5rem] bg-[#0d1b2f] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Trip detected</p>
                  <h2 className="text-2xl font-bold">Europe 2026</h2>
                </div>
                <div className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm text-emerald-200">
                  42 stops
                </div>
              </div>

              <div className="relative h-80 overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-green-950 to-slate-900">
                <div className="absolute left-10 top-12 h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_20px_6px_rgba(110,231,183,0.5)]" />
                <div className="absolute left-28 top-24 h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_20px_6px_rgba(110,231,183,0.5)]" />
                <div className="absolute right-24 top-32 h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_20px_6px_rgba(110,231,183,0.5)]" />
                <div className="absolute bottom-20 right-12 h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_20px_6px_rgba(110,231,183,0.5)]" />

                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 400 320"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M55 65 C 120 90, 110 130, 170 115 S 280 115, 305 160 S 330 240, 360 245"
                    stroke="#34d399"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray="10 10"
                  />
                </svg>

                <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                  <p className="text-sm text-slate-300">Generated route</p>
                  <p className="font-semibold">Paris → Metz → Zurich → Milan</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 pb-10 md:grid-cols-3">
          <FeatureCard
            icon={<Camera className="h-5 w-5" />}
            title="Upload photo metadata"
            description="Import timestamped GPS data from Apple or Google Photos exports."
          />
          <FeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            title="Infer trips with AI"
            description="Cluster travel patterns and resolve messy location data into clean trips."
          />
          <FeatureCard
            icon={<Map className="h-5 w-5" />}
            title="Share animated maps"
            description="Turn your travel history into interactive timelines and public route pages."
          />
        </div>
      </section>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
        {icon}
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}