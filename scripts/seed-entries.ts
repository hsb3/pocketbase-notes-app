import PocketBase from "pocketbase";
const pb = new PocketBase(process.env.VITE_PB_URL);
await pb
  .collection("_superusers")
  .authWithPassword(process.env.PB_EMAIL!, process.env.PB_PASSWORD!);
const email = process.env.SEED_USER_EMAIL || "user@example.com";
const password = process.env.SEED_USER_PASSWORD || "user-changeme-123";
let user;
try {
  user = await pb
    .collection("users")
    .getFirstListItem(pb.filter("email = {:email}", { email }));
} catch (error) {
  if ((error as { status: number }).status !== 404) throw error;
  user = await pb.collection("users").create({
    email,
    password,
    passwordConfirm: password,
    name: "Jamie",
    verified: true,
  });
}
const existing = await pb
  .collection("entries")
  .getList(1, 1, { filter: pb.filter("user = {:id}", { id: user.id }) });
if (existing.totalItems === 0) {
  const samples = [
    {
      title: "A slower start",
      kind: "journal",
      journal_date: "2026-10-19",
      favorite: true,
      text: "I took a walk before opening my laptop. It made the rest of the morning feel less hurried.",
      reflection:
        "A little space at the beginning changes the shape of the day.",
    },
    {
      title: "Ideas for the reading nook",
      kind: "note",
      journal_date: "",
      favorite: false,
      text: "A lamp, a shelf, and room to pause. A corner that makes picking up a book the easiest thing to do.",
      reflection: "Start with what is already here.",
    },
    {
      title: "Things worth keeping",
      kind: "journal",
      journal_date: "2026-10-18",
      favorite: false,
      text: "A long conversation. The first cool morning. Finishing a book that I had set aside for months.",
      reflection: "Small things count, too.",
    },
  ];
  for (const sample of samples) {
    const { text, reflection, ...fields } = sample;
    await pb.collection("entries").create({
      ...fields,
      user: user.id,
      revision: 1,
      body: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text }] },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Something to remember" }],
          },
          {
            type: "blockquote",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: reflection }],
              },
            ],
          },
        ],
      },
    });
  }
  console.log("Seeded sample notes and journal entries.");
} else console.log("Existing entries preserved; no sample data added.");
