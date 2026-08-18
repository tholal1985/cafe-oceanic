import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Leaf, Settings, Sparkles, Star, UtensilsCrossed } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

type Advertisement = Database['public']['Tables']['advertisements']['Row'];

const FALLBACK_HERO =
  'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1920';

const HIGHLIGHTS = [
  { icon: Leaf, label: 'Locally sourced' },
  { icon: UtensilsCrossed, label: 'Chef-crafted menus' },
  { icon: Sparkles, label: 'Ready in minutes' },
];

function formatTime() {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());
}

export default function WelcomeScreen() {
  const navigate = useNavigate();
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(formatTime());

  useEffect(() => {
    supabase
      .from('advertisements')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .then(({ data }) => {
        setAds(data ?? []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClock(formatTime()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (ads.length <= 1) return;
    const ad = ads[currentAdIndex];
    const timer = setTimeout(() => {
      if (ad) {
        supabase
          .from('advertisements')
          .update({ impressions: ad.impressions + 1 })
          .eq('id', ad.id)
          .then();
      }
      setCurrentAdIndex((i) => (i + 1) % ads.length);
    }, 6500);
    return () => clearTimeout(timer);
  }, [currentAdIndex, ads]);

  const currentAd = ads[currentAdIndex];
  const backdrop = useMemo(() => currentAd?.media_url ?? FALLBACK_HERO, [currentAd]);

  const handleStart = () => navigate('/menu');

  if (loading) {
    return (
      <div className="min-h-screen bg-ocean-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-ivory-100">
          <span className="h-2 w-2 animate-ping rounded-full bg-amber-400" />
          <span className="font-light tracking-wide">Preparing your experience…</span>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleStart}
      className="relative min-h-screen overflow-hidden bg-ocean-950 text-ivory-50 select-none cursor-pointer"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentAd?.id ?? 'fallback'}
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          {currentAd?.media_type === 'video' ? (
            <video
              src={backdrop}
              autoPlay
              muted
              loop
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <img src={backdrop} alt="" className="h-full w-full object-cover" />
          )}
        </motion.div>
      </AnimatePresence>

      <div className="absolute inset-0 bg-gradient-to-t from-ocean-950 via-ocean-950/70 to-ocean-950/30" />
      <div className="absolute inset-0 bg-gradient-to-br from-ocean-950/60 via-transparent to-amber-900/20" />
      <div className="absolute inset-0 bg-grain opacity-40 mix-blend-overlay pointer-events-none" />

      <motion.button
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        onClick={(e) => {
          e.stopPropagation();
          navigate('/admin/login');
        }}
        className="absolute right-6 top-6 z-30 flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white/80 backdrop-blur-md transition hover:border-white/30 hover:bg-white/10 hover:text-white"
        aria-label="Admin Login"
      >
        <Settings className="h-4 w-4" />
        <span className="tracking-wide uppercase">Staff</span>
      </motion.button>

      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="absolute left-6 top-6 z-30 flex items-center gap-3 text-ivory-100/90"
      >
        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 backdrop-blur-md">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          <span className="text-xs font-medium tracking-[0.2em] uppercase">Open · {clock}</span>
        </div>
      </motion.div>

      <div className="relative z-20 flex min-h-screen flex-col">
        <div className="flex-1" />

        <div className="px-8 pb-24 sm:px-16 md:px-24 lg:px-32">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="mb-4 flex items-center gap-3 text-xs font-medium tracking-[0.32em] uppercase text-amber-300/90"
          >
            <span className="h-px w-10 bg-amber-300/60" />
            Cafe Oceanic · Est. 1998
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-[clamp(3rem,8vw,7.5rem)] leading-[0.95] font-medium tracking-tight text-white"
          >
            Today&rsquo;s menu,
            <br />
            <span className="italic text-amber-300">crafted for you</span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.8 }}
            className="mt-6 max-w-xl text-lg text-ivory-100/80"
          >
            Browse the kitchen&rsquo;s daily selection, customize every detail, and pay in seconds.
            Your food will be ready before you know it.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75, duration: 0.8 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleStart();
              }}
              className="group inline-flex items-center gap-3 rounded-full bg-amber-400 px-9 py-5 text-base font-semibold text-ocean-950 shadow-lifted transition-all hover:bg-amber-300"
            >
              Start your order
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ocean-950 text-amber-300 transition-transform group-hover:translate-x-0.5">
                <ArrowRight className="h-4 w-4" />
              </span>
            </button>

            <div className="flex items-center gap-2 text-sm text-ivory-100/70">
              <Star className="h-4 w-4 fill-amber-300 text-amber-300" />
              <span>4.9 / 5 · 2,400+ guests this week</span>
            </div>
          </motion.div>

          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 1 }}
            className="mt-12 flex flex-wrap gap-4"
          >
            {HIGHLIGHTS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-ivory-100/85 backdrop-blur"
              >
                <Icon className="h-4 w-4 text-amber-300" />
                {label}
              </li>
            ))}
          </motion.ul>
        </div>

        {ads.length > 1 && (
          <div className="absolute bottom-8 right-8 z-30 flex items-center gap-2">
            {ads.map((ad, index) => (
              <button
                key={ad.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentAdIndex(index);
                }}
                className={`h-1 rounded-full transition-all duration-500 ${
                  index === currentAdIndex ? 'w-10 bg-amber-300' : 'w-4 bg-white/30 hover:bg-white/50'
                }`}
                aria-label={`Advertisement ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      <motion.div
        animate={{ opacity: [0.35, 0.75, 0.35] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 text-[11px] tracking-[0.4em] uppercase text-white/60"
      >
        Touch anywhere to begin
      </motion.div>
    </div>
  );
}
