import { Link } from "react-router-dom";

export function Privacy() {
  return (
    <div className="panel prose">
      <h1>Privacy</h1>
      <p>Cotsi is built by Siddhesh Thapa. This page says what Cotsi stores and why, in plain words.</p>
      <h2>What Cotsi stores</h2>
      <ul>
        <li>Your Google name and email, to sign you in.</li>
        <li>Your lessons, answers and progress, so you can continue where you left off.</li>
        <li>
          If you use job preparation: a career profile taken from your CV (skills, experience, education, country). The CV file itself is not kept,
          and contact details in it are left out of the profile.
        </li>
      </ul>
      <h2>How your data is used</h2>
      <ul>
        <li>Lessons and CV analysis are produced by Claude, an AI model from Anthropic. What you type, and your CV when you upload it, is sent to Anthropic to generate the reply.</li>
        <li>Job research uses web search. Your name and contact details are not included in searches.</li>
        <li>Your data is stored with Supabase. It is never sold or used for advertising.</li>
      </ul>
      <h2>Your control</h2>
      <p>
        You can delete any lesson from its page, and delete your account with everything saved about you from <Link to="/settings">Settings</Link>.
      </p>
      <h2>Good to know</h2>
      <p>
        Cotsi teaches with AI and can make mistakes. Job forecasts are estimates from public information, not guarantees of a job or a salary.
        Lessons on money, health or law are education, not professional advice.
      </p>
    </div>
  );
}
