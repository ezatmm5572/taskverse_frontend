<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Command, ArrowRight, Users, ListTodo, ShieldCheck, Bell, LayoutDashboard,
  Zap, CheckCircle2, Sparkles, Play
} from 'lucide-vue-next'
import ThemeToggle from '../components/ThemeToggle.vue'
import AppFooter from '../components/AppFooter.vue'

const signedIn = computed(() => !!localStorage.getItem('taskverse-token'))

const features = [
  { icon: ListTodo, title: 'Tasks that stay organised', text: 'Create tasks with dates, descriptions and teams, then track every one from to-do to done.' },
  { icon: Users, title: 'Teams & roles', text: 'Build teams, invite members and give each person the right role: owner, admin or member.' },
  { icon: CheckCircle2, title: 'Per-member assignments', text: 'Assign a task to several people and see each person\'s own progress and status.' },
  { icon: Bell, title: 'Email notifications', text: 'Members are emailed when they are invited or assigned work, so nothing slips through.' },
  { icon: ShieldCheck, title: 'Secure by default', text: 'Email-verified sign-up, JWT sessions with refresh tokens, and Google sign-in support.' },
  { icon: LayoutDashboard, title: 'One clear dashboard', text: 'An overview of workload, deadlines and team activity, in light or dark mode.' },
]

const steps = [
  { n: '01', title: 'Create your workspace', text: 'Sign up and verify your email in under a minute.' },
  { n: '02', title: 'Add your team', text: 'Invite members and set their roles.' },
  { n: '03', title: 'Ship the work', text: 'Create tasks, assign them and watch progress update.' },
]
</script>

<template>
  <div class="home">
    <div class="ambient-bg" aria-hidden="true">
      <div class="aurora-orb orb-violet"></div>
      <div class="aurora-orb orb-pink"></div>
      <div class="aurora-orb orb-cyan"></div>
    </div>

    <header class="home-nav glass-panel">
      <RouterLink to="/" class="brand">
        <div class="brand-mark"><Command :size="22" stroke-width="2.5" /></div>
        <span>taskverse<span class="brand-dot">.</span></span>
      </RouterLink>
      <nav class="home-links" aria-label="Primary">
        <a href="#features">Features</a>
        <a href="#how">How it works</a>
      </nav>
      <div class="home-actions">
        <ThemeToggle compact />
        <RouterLink to="/app" class="primary-btn">
          {{ signedIn ? 'Open workspace' : 'Sign in' }}
          <ArrowRight :size="16" />
        </RouterLink>
      </div>
    </header>

    <main>
      <section class="hero">
        <span class="hero-pill glass"><Sparkles :size="14" /> Task &amp; team management, simplified</span>
        <h1>Plan work. Assign it.<br /><span class="grad">Get it done together.</span></h1>
        <p class="hero-sub">
          TaskVerse brings your tasks, teams and deadlines into one calm workspace,
          so everyone knows what to do next.
        </p>
        <div class="hero-cta">
          <RouterLink to="/app" class="primary-btn big">
            {{ signedIn ? 'Open workspace' : 'Get started' }} <ArrowRight :size="18" />
          </RouterLink>
          <RouterLink to="/app?demo=1" class="ghost-btn glass glass-interactive">
            <Play :size="16" /> Try the demo
          </RouterLink>
        </div>

        <div class="hero-card glass-panel" aria-hidden="true">
          <div class="hc-row"><span class="dot todo"></span><b>Design landing page</b><i>To do</i></div>
          <div class="hc-row"><span class="dot prog"></span><b>Build API endpoints</b><i>In progress</i></div>
          <div class="hc-row"><span class="dot done"></span><b>Set up database</b><i>Completed</i></div>
        </div>
      </section>

      <section id="features" class="section">
        <h2>Everything your team needs</h2>
        <p class="section-sub">Simple tools that cover the whole task lifecycle.</p>
        <div class="feature-grid">
          <article v-for="f in features" :key="f.title" class="feature glass glass-interactive">
            <div class="f-icon"><component :is="f.icon" :size="20" /></div>
            <h3>{{ f.title }}</h3>
            <p>{{ f.text }}</p>
          </article>
        </div>
      </section>

      <section id="how" class="section">
        <h2>How it works</h2>
        <p class="section-sub">From sign-up to shipped in three steps.</p>
        <div class="steps">
          <article v-for="s in steps" :key="s.n" class="step glass">
            <span class="step-n">{{ s.n }}</span>
            <h3>{{ s.title }}</h3>
            <p>{{ s.text }}</p>
          </article>
        </div>
      </section>

      <section class="section cta glass-panel">
        <Zap :size="26" class="cta-icon" />
        <h2>Ready to get organised?</h2>
        <p class="section-sub">Create a free workspace and invite your team today.</p>
        <RouterLink to="/app" class="primary-btn big">
          {{ signedIn ? 'Open workspace' : 'Create your workspace' }} <ArrowRight :size="18" />
        </RouterLink>
      </section>
    </main>

    <AppFooter class="home-footer" />
  </div>
</template>

<style scoped>
.home { position: relative; z-index: 1; min-height: 100vh; padding: 16px clamp(16px, 4vw, 48px) 32px; display: flex; flex-direction: column; gap: 24px; }
.home > * { position: relative; z-index: 1; }
.ambient-bg { z-index: 0 !important; }
a { text-decoration: none; color: inherit; }

.home-nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 16px; border-radius: 18px; max-width: 1200px; width: 100%; margin: 0 auto; position: sticky; top: 12px; z-index: 5; }
.home-links { display: flex; gap: 22px; color: var(--text-muted); font-size: 14px; font-weight: 500; }
.home-links a:hover { color: var(--text-main); }
.home-actions { display: flex; align-items: center; gap: 12px; }

.hero { max-width: 900px; margin: 40px auto 0; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 22px; }
.hero-pill { display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; border-radius: 999px; font-size: 13px; color: var(--text-muted); }
.hero h1 { font-family: 'Space Grotesk', 'Plus Jakarta Sans', sans-serif; font-size: clamp(36px, 7vw, 68px); line-height: 1.05; letter-spacing: -0.03em; }
.grad { background: var(--primary-gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }
.hero-sub { max-width: 600px; color: var(--text-muted); font-size: clamp(15px, 2vw, 18px); line-height: 1.6; }
.hero-cta { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
.primary-btn.big { padding: 14px 26px; font-size: 15px; border-radius: 14px; }
.ghost-btn { display: inline-flex; align-items: center; gap: 8px; padding: 14px 22px; border-radius: 14px; font-weight: 600; font-size: 15px; }

.hero-card { width: min(100%, 520px); margin-top: 18px; padding: 14px; border-radius: 20px; display: grid; gap: 8px; text-align: left; }
.hc-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: var(--glass-bg-subtle); font-size: 14px; }
.hc-row b { flex: 1; font-weight: 600; }
.hc-row i { font-style: normal; font-size: 12px; color: var(--text-muted); }
.dot { width: 10px; height: 10px; border-radius: 50%; }
.dot.todo { background: var(--status-todo); }
.dot.prog { background: var(--status-in-progress); }
.dot.done { background: var(--status-completed); }

.section { max-width: 1100px; width: 100%; margin: 56px auto 0; text-align: center; scroll-margin-top: 90px; }
.section h2 { font-family: 'Space Grotesk', 'Plus Jakarta Sans', sans-serif; font-size: clamp(26px, 4vw, 38px); letter-spacing: -0.02em; }
.section-sub { color: var(--text-muted); margin: 10px 0 28px; }
.feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; text-align: left; }
.feature { padding: 22px; border-radius: 18px; }
.feature:hover { transform: translateY(-4px); box-shadow: var(--card-shadow-hover); }
.f-icon { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; background: var(--primary-gradient); color: #fff; margin-bottom: 14px; }
.feature h3, .step h3 { font-size: 16px; margin-bottom: 6px; }
.feature p, .step p { color: var(--text-muted); font-size: 14px; line-height: 1.55; }

.steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; text-align: left; }
.step { padding: 22px; border-radius: 18px; }
.step-n { display: inline-block; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 28px; margin-bottom: 8px; background: var(--primary-gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }

.cta { padding: 44px 24px; border-radius: 26px; display: flex; flex-direction: column; align-items: center; }
.cta .section-sub { margin-bottom: 22px; }
.cta-icon { color: var(--accent-amber); margin-bottom: 10px; }

.home-footer { max-width: 1200px; width: 100%; margin: 48px auto 0; }

@media (max-width: 640px) {
  .home-links { display: none; }
  .home-nav { padding: 8px 12px; }
}

@media (max-width: 760px) {
  .home { padding: 10px 12px 24px; gap: 16px; }
  .home-nav { position: relative; top: auto; flex-wrap: wrap; padding: 10px 12px; gap: 10px; }
  .home-links { order: 3; width: 100%; justify-content: center; gap: clamp(12px, 4vw, 22px); }
  .home-actions { margin-left: auto; gap: 8px; }
  .hero { margin-top: 24px; gap: 17px; }
  .hero h1 { font-size: clamp(32px, 9vw, 52px); overflow-wrap: anywhere; }
  .hero-sub { padding-inline: 4px; }
  .hero-cta { width: 100%; }
  .hero-cta > a { justify-content: center; }
  .hc-row { padding: 10px; gap: 8px; font-size: 12px; }
  .hc-row i { font-size: 11px; }
  .section { margin-top: 36px; }
  .feature-grid, .steps { grid-template-columns: minmax(0, 1fr); }
  .feature, .step { padding: 18px; }
  .cta { padding: 30px 16px; }
}
@media (max-width: 420px) {
  .brand { gap: 8px; }
  .brand-mark { flex-shrink: 0; }
  .home-actions .primary-btn { padding: 9px 10px; font-size: 12px; }
  .hero-pill { font-size: 11px; text-align: center; }
  .hero-cta { flex-direction: column; align-items: stretch; }
  .hero-cta > a { width: 100%; }
  .hc-row b { overflow-wrap: anywhere; }
  .hc-row i { max-width: 72px; text-align: right; }
}

</style>
