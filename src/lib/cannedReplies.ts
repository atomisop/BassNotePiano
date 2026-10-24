/**
 * Replies the teacher sends again and again. One tap in Support Chat puts the text in the reply box (nothing is sent until
 * Send is pressed), so it can be edited first. Edit the wording here.
 */
export const CANNED_REPLIES: { label: string; text: string }[] = [
  {
    label: "Link Discord",
    text: "To link Discord, open Home and tap Link your Discord (or the card at the bottom of the left menu), sign in to Discord and approve. Your private class call opens there before each lesson. If it does not work, tell me what you see and I will help.",
  },
  {
    label: "How payment works",
    text: "Pick a plan under Online Lessons, then Payment plan. You will get a payment code to put in the note when you send the Zelle, Venmo or bank payment. Once the payment arrives it is matched automatically and your classes are booked. If it has not shown up after a few hours, reply here with the date and amount and I will check.",
  },
  {
    label: "Cancel or change a class",
    text: "You can move or cancel a single class under Online Lessons up to 24 hours before it starts. Inside 24 hours I cannot move it automatically, but write me the day you need and I will see what I can do.",
  },
  {
    label: "Cancel my plan",
    text: "You can cancel your plan yourself under Settings. You keep your classes until the end of the 4 weeks you already paid for. If you would like to pause or switch plans instead, tell me and I will help with that.",
  },
  {
    label: "Next scale",
    text: "Each new scale opens when I approve it, once the previous scale's checklist is finished and at least a week has passed since the last unlock. I will open yours as soon as you are ready.",
  },
  {
    label: "Got it, checking",
    text: "Thanks for letting me know. I am looking into it now and will reply here as soon as I have an answer.",
  },
];
