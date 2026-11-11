# Product

Written by Claude from the project conversation; the owner skipped the design
interview. Edit anything here that is wrong.

## Register

product

## Users

Students in a computer organization and architecture class, and the classmate
presenting. They open the site on their own phones in a lit classroom while the
presenter's screen is on a projector. They know system design vocabulary. Their
job on the event page: grab a seat before someone else does, pay, and see what
the system did about the people who lost.

## Product Purpose

A working ticket-booking site that makes its contention handling visible. Many
people tap the same seat; exactly one gets it; everyone watches the seat map and
the counters change live. Success is a room that tries to break it, cannot, and
can see why.

## Brand Personality

Quick, plain-spoken, a little playful. It sounds like a box-office window: short
sentences, no hype. The interface gets out of the way of the seat map.

## Anti-references

- Real ticketing sites' dark patterns: fake urgency banners, surprise fees,
  pop-ups over the seat map.
- Dark "concert poster" themes with neon gradients; they wash out on a projector.
- Dashboards that turn four counters into giant hero numbers.

## Design Principles

1. The seat map is the page. Everything else is subordinate to it.
2. Show the machinery: state changes made by other people are visible the
   moment they happen, with who did them.
3. Never rely on colour alone; a washed-out projector must still tell
   available, held, yours and sold apart.
4. Say what happened and what to do next, in one sentence, where it happened.
5. One thumb on a phone is the baseline; the projector view is the same page,
   wider.

## Accessibility & Inclusion

WCAG 2.2 AA. Every seat is a labelled, keyboard-reachable control. Seat states
differ by shape and mark as well as colour. Motion only signals a state change
and is removed under reduced-motion. Countdown and conflict messages are
announced to screen readers.
