<script setup>
import { RouterLink } from 'vue-router'
import { ArrowLeft, ArrowRight, Command, ShieldCheck, Sparkles } from 'lucide-vue-next'

// Sign-in / sign-up / OTP / password-reset card. State lives in the parent; this component only renders and emits.
defineProps({
  mode: { type: String, required: true },
  form: { type: Object, required: true },
  reset: { type: Object, required: true },
  busy: Boolean,
  error: { type: String, default: '' }
})
const emit = defineEmits(['update:mode', 'signIn', 'signUp', 'confirm', 'resend', 'forgot', 'reset', 'demo'])
const go = m => emit('update:mode', m)
</script>

<template>
  <section class="auth-card glass-panel">
    <RouterLink to="/" class="back-home"><ArrowLeft :size="14" /> Back to home</RouterLink>
    <div class="brand auth-brand">
      <div class="brand-mark"><Command :size="22" stroke-width="2.5" /></div>
      <span>taskverse<span class="brand-dot">.</span></span>
    </div>

    <div class="auth-kicker">
      <span class="live-dot"></span> TEAMWORK, ELEVATED IN GLASS
    </div>

    <!-- SIGN IN FORM -->
    <template v-if="mode === 'signin'">
      <h1>Welcome back<span class="brand-dot">.</span></h1>
      <p class="muted">Access your workspace, projects, and active teams.</p>

      <form @submit.prevent="emit('signIn')" class="form-stack">
        <label>
          Email address
          <input v-model="form.email" type="email" required autocomplete="email" placeholder="alex@company.com" />
        </label>
        <label>
          Password
          <input v-model="form.password" type="password" required autocomplete="current-password" placeholder="••••••••" />
        </label>
        <button class="primary-btn full-btn" :disabled="busy">
          <span>{{ busy ? 'Authenticating…' : 'Sign in to Workspace' }}</span>
          <ArrowRight :size="17" />
        </button>
      </form>

      <button class="link-btn centered" @click="go('forgot')">Forgot your password?</button>

      <div class="auth-divider"><span></span> EXPLORE OR CREATE <span></span></div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button class="secondary-btn full-btn" @click="emit('demo')">
          <Sparkles :size="16" style="color: var(--primary);" />
          <span>Explore Interactive Demo Mode</span>
        </button>
        <button class="secondary-btn full-btn" @click="go('signup')">
          <span>Create a new admin account</span>
        </button>
      </div>
    </template>

    <!-- SIGN UP FORM -->
    <template v-else-if="mode === 'signup'">
      <h1>Create workspace<span class="brand-dot">.</span></h1>
      <p class="muted">Start coordinating your projects in luminous style.</p>

      <form @submit.prevent="emit('signUp')" class="form-stack">
        <div class="two-fields">
          <label>First name<input v-model="form.fname" required minlength="2" placeholder="Alex" /></label>
          <label>Last name<input v-model="form.lname" required minlength="2" placeholder="Vance" /></label>
        </div>
        <label>Email address<input v-model="form.email" type="email" required placeholder="alex@company.com" /></label>
        <label>
          Gender
          <select v-model="form.gender">
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
        <label>Password<input v-model="form.password" type="password" required minlength="8" placeholder="Upper, lower, number, @$!%*?&" /></label>
        <label>Confirm password<input v-model="form.confirmPassword" type="password" required placeholder="Repeat password" /></label>
        <button class="primary-btn full-btn" :disabled="busy">
          <span>Create account</span>
          <ArrowRight :size="17" />
        </button>
      </form>
      <button class="link-btn centered" @click="go('signin')">Already have an account? Sign in</button>
    </template>

    <!-- OTP CONFIRMATION -->
    <template v-else-if="mode === 'confirm'">
      <h1>Verify your email<span class="brand-dot">.</span></h1>
      <p class="muted">Enter the 6-digit confirmation code sent to {{ form.email }}.</p>
      <form @submit.prevent="emit('confirm')" class="form-stack">
        <label>
          6-digit Code
          <input v-model="form.otp" required inputmode="numeric" minlength="6" maxlength="6" placeholder="123456" />
        </label>
        <button class="primary-btn full-btn">Verify and Continue</button>
      </form>
      <button class="link-btn centered" @click="emit('resend')">Resend code</button>
      <button class="link-btn centered" @click="go('signin')">Back to sign in</button>
    </template>

    <!-- FORGOT PASSWORD -->
    <template v-else-if="mode === 'forgot'">
      <h1>Reset password<span class="brand-dot">.</span></h1>
      <p class="muted">We will send a one-time verification code to your email.</p>
      <form @submit.prevent="emit('forgot')" class="form-stack">
        <label>Email address<input v-model="reset.email" type="email" required placeholder="alex@company.com" /></label>
        <button class="primary-btn full-btn">Send verification code</button>
      </form>
      <button class="link-btn centered" @click="go('signin')">Back to sign in</button>
    </template>

    <!-- RESET PASSWORD -->
    <template v-else-if="mode === 'reset'">
      <h1>New password<span class="brand-dot">.</span></h1>
      <form @submit.prevent="emit('reset')" class="form-stack">
        <label>Email address<input v-model="reset.email" type="email" required /></label>
        <label>Verification Code<input v-model="reset.otp" required minlength="6" maxlength="6" /></label>
        <label>New password<input v-model="reset.password" type="password" required minlength="8" /></label>
        <label>Confirm new password<input v-model="reset.confirmPassword" type="password" required minlength="8" /></label>
        <button class="primary-btn full-btn">Save new password</button>
      </form>
      <button class="link-btn centered" @click="go('signin')">Back to sign in</button>
    </template>

    <p class="auth-error" v-if="error">{{ error }}</p>

    <div class="auth-bottom">
      <ShieldCheck :size="15" /> Protected by TaskVerse JWT & Rate-Limiter Engine
    </div>
  </section>
</template>
