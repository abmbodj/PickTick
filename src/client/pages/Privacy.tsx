export default function Privacy() {
  return (
    <main className="max-w-[65ch] py-8">
      <h1 className="display text-3xl sm:text-4xl">Privacy</h1>
      <p className="mt-4">PickTick stores as little as it can. This is all of it.</p>
      <h2 className="mt-8 text-xl font-bold">What is stored</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>
          One cookie holding a random id. It is how your holds and tickets stay yours, it lasts 30 days, and
          it is not used for tracking or advertising.
        </li>
        <li>The name you type before holding a seat. Other visitors see it on seats you hold or reserve.</li>
        <li>Your reservations: the event, the seats and the total.</li>
        <li>Your browser keeps the name you typed so you do not have to type it again.</li>
      </ul>
      <h2 className="mt-8 text-xl font-bold">What is not collected</h2>
      <p className="mt-3">
        No email address, no password and no payment details. Nothing is charged, and PickTick does not
        issue real tickets. There are no advertisers and no analytics scripts.
      </p>
      <h2 className="mt-8 text-xl font-bold">Third parties</h2>
      <p className="mt-3">
        Some event listings and their images come from Ticketmaster, and your browser loads those images
        from Ticketmaster's servers. Fonts are loaded from Google Fonts. PickTick runs on Cloudflare.
      </p>
      <h2 className="mt-8 text-xl font-bold">Removing your data</h2>
      <p className="mt-3">
        Clearing this site's cookies cuts the link between you and your reservations. Reservations may be
        cleared for everyone at any time.
      </p>
    </main>
  );
}
