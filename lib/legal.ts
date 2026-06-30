export const LEGAL_VERSION = "2026-06-30";
export const legalAcceptanceStorageKey = "dark-drives:legal-acceptance";

export type LegalAcceptance = {
  version: string;
  acceptedAt: string;
};

export const legalAcknowledgmentPoints = [
  {
    title: "Drive safely and legally.",
    body:
      "You are solely responsible for operating your vehicle safely and obeying all traffic laws. Do not touch your phone while driving. Let a passenger handle the app, or pull over safely first. Audio plays on its own so you can keep your eyes on the road."
  },
  {
    title: "Do not trespass.",
    body:
      "View every stop from public roads only. Do not enter private property, restricted areas, or any building, and obey all posted signs and local laws. This app gives you no right to access any location."
  },
  {
    title: "For entertainment only.",
    body:
      "The stories and paranormal claims in this experience are local folklore presented for entertainment. They are not statements of fact. You take part at your own risk."
  }
];

export const legalDocuments = {
  terms: {
    title: "Terms of Use",
    note: "Draft placeholder pending lawyer review.",
    sections: [
      {
        title: "Use of the experience",
        body:
          "Dark Drives is a self-guided audio entertainment experience. You are responsible for deciding whether, when, and how to visit any location. You must obey traffic laws, posted signs, property rules, and local laws at all times."
      },
      {
        title: "No access rights",
        body:
          "The app does not grant permission to enter private property, restricted areas, buildings, campuses after hours, construction areas, or any location closed to the public. View stops from public roads or lawful public vantage points only."
      },
      {
        title: "Safety and assumption of risk",
        body:
          "You are responsible for your own safety and for the safe operation of your vehicle. Do not interact with the app while driving. Use a passenger operator or pull over safely first. Participation is voluntary and at your own risk."
      },
      {
        title: "Folklore and entertainment",
        body:
          "Stories, paranormal claims, rituals, and route narration are provided as folklore and entertainment. They are not presented as verified fact."
      }
    ]
  },
  privacy: {
    title: "Privacy Policy",
    note: "Draft placeholder pending lawyer review.",
    sections: [
      {
        title: "Location",
        body:
          "The app may request device location to help arm nearby route stops during a drive. Location is used on the device for the route experience. The legal final should define any collection, storage, retention, and sharing rules."
      },
      {
        title: "Payments and access",
        body:
          "Purchases and payment processing are handled by Stripe. Route access may use account or session data needed to verify entitlement."
      },
      {
        title: "Local storage",
        body:
          "This device stores route progress, welcome state, cache state, and legal acceptance locally in the browser. Legal acceptance is per device and is not synced across devices."
      },
      {
        title: "Offline use",
        body:
          "Route assets and legal text may be bundled or cached so the app can work with limited signal. Clearing browser data may remove cached route files and local acceptance records."
      }
    ]
  }
};
