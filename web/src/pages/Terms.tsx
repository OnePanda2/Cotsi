import { Link } from "react-router-dom";

/** Bump together with TERMS_VERSION in supabase/functions/api/src/app.ts when learners must accept again. */
export const TERMS_VERSION = "2026-11-16";
export const TERMS_UPDATED = "16 November 2026";
/** Where complaints and questions go. Shown on this page as the grievance contact. */
export const CONTACT_EMAIL = "siddeshthapa02@gmail.com";

function Contact() {
  return CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : <b>[contact email to be added]</b>;
}

export function Terms() {
  return (
    <div className="panel prose terms">
      <h1>Terms of Use</h1>
      <p className="fine">Last updated {TERMS_UPDATED}. Please read them; they're written in plain words.</p>

      <h2>1. Who runs Cotsi</h2>
      <p>
        Cotsi is run by Siddhesh Thapa, Nashik, Maharashtra, India. Questions and complaints: <Contact />. By using Cotsi, you agree to these
        terms and to the <Link to="/privacy">Privacy policy</Link>.
      </p>

      <h2>2. Who can use it</h2>
      <ul>
        <li>You must be 18 or older.</li>
        <li>One account per person. Keep your Google account secure, and don't share your Cotsi account.</li>
      </ul>

      <h2>3. What Cotsi teaches, and what it doesn't</h2>
      <ul>
        <li>Cotsi is an AI tutor for understanding: ideas, concepts, history, logic, technology, business, and the theory behind skills.</li>
        <li>
          <b>It can't replace hands-on training.</b> Physical skills, such as playing an instrument, a sport, driving, cooking, or a trade like
          bricklaying or electrical work, need real practice, ideally with a teacher. Cotsi can only explain the theory.
        </li>
        <li>
          <b>Never try dangerous work because of a lesson.</b> Electrical wiring, gas, heights, heavy machinery, chemicals and medical
          procedures need proper training and supervision.
        </li>
        <li>
          <b>It isn't professional advice.</b> Lessons about health, mental health, money, tax, investing or law are education only. For your
          own situation, ask a qualified professional.
        </li>
        <li>Cotsi isn't a school, exam board or certifying body, and doesn't issue qualifications.</li>
      </ul>

      <h2>4. AI can be wrong</h2>
      <ul>
        <li>Lessons and job research are written by AI (Claude, made by Anthropic). They can contain mistakes, or be outdated or incomplete.</li>
        <li>Check anything important before you rely on it, especially for rare or very new topics where little reliable information exists.</li>
        <li>If you spot a mistake, tell us at the contact above so we can fix it.</li>
      </ul>

      <h2>5. Job preparation</h2>
      <ul>
        <li>
          Roles "rising in your field", salary notes, skill gaps and time estimates are <b>estimates from public information</b>. They are not
          guarantees of a job, an interview, a salary or any result.
        </li>
        <li>
          Job openings Cotsi finds belong to other companies and websites. Cotsi doesn't check those employers. Apply carefully, and{" "}
          <b>never pay anyone for a job offer</b>.
        </li>
        <li>Cotsi is not a placement agency. It doesn't find you a job or charge for placement.</li>
      </ul>

      <h2>6. What you share</h2>
      <ul>
        <li>What you type and upload, including your CV, stays yours. You let Cotsi use it to run the service, which includes sending it to Anthropic to write replies.</li>
        <li>Only upload your own CV and information. Don't upload other people's personal details, or anything you don't have the right to share.</li>
        <li>Don't share things Cotsi doesn't need, such as ID numbers, bank details or passwords.</li>
      </ul>

      <h2>7. Fair use</h2>
      <ul>
        <li>Don't use Cotsi to break the law, to harm anyone, or to cheat in exams or assignments where AI help isn't allowed.</li>
        <li>Don't try to break, overload, copy or resell the service, or get around its limits.</li>
        <li>Cotsi has daily limits so the service stays fair for everyone.</li>
        <li>We may limit or close accounts that break these rules.</li>
      </ul>

      <h2>8. Books, shows and brands</h2>
      <ul>
        <li>Cotsi explains books in its own words. It doesn't give you copies of books; to read one, buy or borrow it.</li>
        <li>
          Characters and shows used in examples are only there to make ideas easier to remember. Cotsi isn't connected to, or endorsed by,
          their owners.
        </li>
        <li>The Cotsi name, logo and app belong to Siddhesh Thapa. Your lessons are yours to use for your own learning.</li>
      </ul>

      <h2>9. Paid plans</h2>
      <p>
        If you buy a paid plan, its price, what it includes and its refund terms are shown before you pay, with taxes where they apply. Nothing
        in these terms limits your rights under the Consumer Protection Act, 2019.
      </p>

      <h2>10. Changes and availability</h2>
      <ul>
        <li>Cotsi is new and will change. Features, limits and prices can change. We'll tell you in the app before an important change.</li>
        <li>If these terms change in an important way, we'll ask you to accept them again.</li>
        <li>The service may sometimes be slow or unavailable. We'll try to give notice before stopping any paid service.</li>
      </ul>

      <h2>11. Responsibility</h2>
      <p>
        You're responsible for how you use what you learn. As far as the law allows, Cotsi isn't responsible for losses caused by relying on a
        lesson, a forecast or a job listing. This doesn't take away rights the law gives you.
      </p>

      <h2>12. Complaints</h2>
      <p>
        Grievance officer: Siddhesh Thapa, <Contact />. We'll confirm we got your complaint within 48 hours and aim to resolve it within one
        month.
      </p>

      <h2>13. Law</h2>
      <p>
        These terms follow the laws of India. Disputes go to the courts in Nashik, Maharashtra. This doesn't stop you from approaching a consumer
        commission where the law allows.
      </p>

      <h2>14. Leaving</h2>
      <p>
        You can stop using Cotsi at any time, and delete your account and everything saved about you from <Link to="/settings">Settings</Link>.
      </p>
    </div>
  );
}
