import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Folder, FolderPlus, UserRound } from "lucide-react";
import { ClientResponseError } from "pocketbase";
import { NavUser } from "@/components/nav-user";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { pb } from "@/services/pocketbase";
import { createFolder, type listFolders } from "./data";

type Folders = Awaited<ReturnType<typeof listFolders>>;

export function FolderList({
  folders,
  selected,
  onCreated,
  error,
}: {
  folders: Folders;
  selected: string;
  onCreated: (folder: Folders[number]) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const account = pb.authStore.record;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setProblem("Enter a folder name.");
      return;
    }
    setBusy(true);
    try {
      const folder = await createFolder(name);
      setOpen(false);
      onCreated(folder);
    } catch (error) {
      const detail =
        error instanceof ClientResponseError && error.response.data;
      setProblem(
        detail?.name?.message ||
          (detail?.name_key
            ? "A folder with this name already exists."
            : error instanceof Error
              ? error.message
              : "Could not create folder."),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sidebar collapsible="none" className="w-full min-w-0">
      <SidebarHeader className="flex-row items-center justify-between px-3">
        <span className="font-semibold">Notes</span>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (busy) return;
            setOpen(next);
            if (next) {
              setName("");
              setProblem("");
            }
          }}
        >
          <DialogTrigger asChild>
            <Button aria-label="New folder" variant="ghost" size="icon">
              <FolderPlus />
            </Button>
          </DialogTrigger>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>New folder</DialogTitle>
            </DialogHeader>
            <form className="flex flex-col gap-5" onSubmit={submit}>
              <Field data-invalid={!!problem}>
                <FieldLabel htmlFor="folder-name">Folder name</FieldLabel>
                <Input
                  id="folder-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setProblem("");
                  }}
                  aria-invalid={!!problem}
                  aria-describedby={problem ? "folder-error" : undefined}
                />
                {problem && (
                  <FieldError id="folder-error">{problem}</FieldError>
                )}
              </Field>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={busy}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={busy}>
                  Create folder
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <h1 className="px-2 pt-3 text-2xl font-semibold tracking-tight">
          Folders
        </h1>
        {error && <p role="alert">{error}</p>}
        <nav aria-label="Folder destinations">
          <SidebarMenu>
            {[{ id: "all", name: "All Notes" }, ...folders].map((item) => (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  asChild
                  isActive={selected === item.id}
                  className="h-11"
                >
                  <Link
                    to="/folders/$folderId"
                    params={{ folderId: item.id }}
                    search={{}}
                  >
                    <Folder />
                    <span>{item.name}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-t pb-[max(.5rem,env(safe-area-inset-bottom))]">
        <Button asChild variant="ghost" className="justify-start">
          <Link to="/account">
            <UserRound /> Account
          </Link>
        </Button>
        <NavUser
          user={{
            name: account?.name || "My notebook",
            email: account?.email || "",
            avatar: "",
          }}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
