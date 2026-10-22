<script setup>
import { Linkedin, Github, Heart, Sparkles, ExternalLink, Code2 } from 'lucide-vue-next'

defineProps({
  isDemo: {
    type: Boolean,
    default: false
  }
})
</script>

<template>
  <footer class="app-glass-footer glass-panel">
    <div class="footer-left">
      <div class="dev-badge">
        <span class="code-icon"><Code2 :size="16" /></span>
        <span class="dev-text">
          Designed & Developed by
          <strong class="dev-name">Ezat Mohamed</strong>
        </span>
      </div>
      <span class="footer-dot-sep" aria-hidden="true">•</span>
      <span class="footer-meta">TaskVerse Management System</span>
    </div>

    <div class="footer-right">
      <!-- Social Link: LinkedIn -->
      <a
        href="https://www.linkedin.com/in/ezat7/"
        target="_blank"
        rel="noopener noreferrer"
        class="social-glass-btn linkedin-btn"
        aria-label="Ezat Mohamed on LinkedIn"
        title="Connect with Ezat Mohamed on LinkedIn"
      >
        <Linkedin :size="16" />
        <span class="social-label">LinkedIn</span>
        <ExternalLink :size="12" class="external-icon" />
      </a>

      <!-- Social Link: GitHub -->
      <a
        href="https://github.com/ezatmm5572"
        target="_blank"
        rel="noopener noreferrer"
        class="social-glass-btn github-btn"
        aria-label="Ezat Mohamed on GitHub"
        title="View Ezat Mohamed's GitHub profile"
      >
        <Github :size="16" />
        <span class="social-label">GitHub</span>
        <ExternalLink :size="12" class="external-icon" />
      </a>

      <!-- Status dot indicator -->
      <div class="footer-status">
        <span class="live-dot"></span>
        <span>{{ isDemo ? 'Interactive Demo' : 'v1.0.0 Live' }}</span>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.app-glass-footer {
  margin-top: auto;
  border-radius: 18px;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--text-muted);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.app-glass-footer:hover {
  border-color: var(--glass-border-hover);
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.dev-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.code-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: rgba(139, 92, 246, 0.15);
  color: var(--primary);
  border: 1px solid rgba(139, 92, 246, 0.25);
  transition: transform 0.25s ease;
}

.dev-badge:hover .code-icon {
  transform: rotate(10deg) scale(1.08);
}

.dev-text {
  font-weight: 500;
  color: var(--text-main);
}

.dev-name {
  color: var(--primary);
  font-weight: 700;
  margin-left: 4px;
  letter-spacing: -0.2px;
}

.footer-dot-sep {
  opacity: 0.35;
}

.footer-meta {
  font-size: 12px;
  color: var(--text-dim);
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.social-glass-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px;
  border-radius: 11px;
  background: var(--glass-bg-subtle);
  border: 1px solid var(--glass-border);
  color: var(--text-main);
  text-decoration: none;
  font-size: 12.5px;
  font-weight: 600;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.social-glass-btn:hover {
  transform: translateY(-2px);
  background: var(--glass-bg-hover);
  border-color: var(--glass-border-hover);
  box-shadow: var(--glass-shadow);
}

.social-glass-btn:active {
  transform: translateY(0) scale(0.98);
}

.social-glass-btn.linkedin-btn:hover {
  color: #0077b5;
  border-color: rgba(0, 119, 181, 0.4);
  box-shadow: 0 6px 20px -4px rgba(0, 119, 181, 0.25);
}

.social-glass-btn.github-btn:hover {
  color: var(--text-main);
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 6px 20px -4px rgba(0, 0, 0, 0.3);
}

:root[data-theme="light"] .social-glass-btn.github-btn:hover {
  border-color: rgba(15, 23, 42, 0.3);
  box-shadow: 0 6px 20px -4px rgba(15, 23, 42, 0.15);
}

.external-icon {
  opacity: 0.55;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.social-glass-btn:hover .external-icon {
  opacity: 1;
  transform: translate(1px, -1px);
}

.footer-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  color: var(--text-dim);
  padding: 6px 12px;
  border-radius: 10px;
  background: var(--glass-bg-subtle);
  border: 1px solid var(--glass-border);
}

@media (max-width: 768px) {
  .app-glass-footer {
    flex-direction: column;
    align-items: flex-start;
    padding: 18px 20px;
    gap: 14px;
  }
  .footer-right {
    width: 100%;
    justify-content: flex-start;
  }
  .footer-dot-sep {
    display: none;
  }
}
</style>
