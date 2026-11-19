import type PocketBase from "pocketbase";

export async function seedNotes(owner: PocketBase) {
  const notes = owner.collection("notes");
  if ((await notes.getList(1, 1, { fields: "id" })).totalItems) {
    console.log("Existing notes preserved; no sample data added.");
    return;
  }
  const folder = await owner
    .collection("folders")
    .getFirstListItem("is_default = true");
  for (const lines of [
    ["A slower start", "I took a walk before opening my laptop."],
    ["Ideas for the reading nook", "A lamp, a shelf, and room to pause."],
    ["Things worth keeping", "A long conversation. The first cool morning."],
  ]) {
    await notes.create({
      user: folder.user,
      folder: folder.id,
      body: {
        type: "doc",
        content: lines.map((text) => ({
          type: "paragraph",
          content: [{ type: "text", text }],
        })),
      },
    });
  }
  console.log("Seeded sample notes in the Notes folder.");
}
