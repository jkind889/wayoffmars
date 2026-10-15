"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { loadFont } from "@/lib/font-loader";

type PreviewFont = {
  id: string;
  name: string;
} & (
  | { status: "loading" }
  | { status: "ready"; family: string }
  | { status: "error"; message: string }
);

const SAMPLE_TEXT =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

export function FontLibrary() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fonts, setFonts] = useState<PreviewFont[]>([]);
  const loadedFaces = useRef(new Map<string, FontFace>());
  const generation = useRef(0);

  useEffect(() => {
    const faces = loadedFaces.current;
    return () => {
      // An in-flight load must not register a font after this library unmounts.
      generation.current += 1;
      for (const face of faces.values()) document.fonts.delete(face);
      faces.clear();
    };
  }, []);

  const readyCount = fonts.filter((font) => font.status === "ready").length;
  const loadingCount = fonts.filter((font) => font.status === "loading").length;
  const errorCount = fonts.filter((font) => font.status === "error").length;

  async function selectFiles(files: File[]) {
    const currentGeneration = generation.current;
    const entries = files.map((file) => ({
      file,
      id: `wayoffmars-${crypto.randomUUID()}`,
    }));

    setFonts((previous) => [
      ...previous,
      ...entries.map(({ file, id }): PreviewFont => ({
        id,
        name: file.name,
        status: "loading",
      })),
    ]);

    // Decode one file at a time to avoid reading a whole batch into memory.
    for (const { file, id } of entries) {
      if (generation.current !== currentGeneration) return;

      let result: PreviewFont;
      try {
        const face = await loadFont(file, id);
        if (generation.current !== currentGeneration) return;
        document.fonts.add(face);
        loadedFaces.current.set(id, face);
        result = { id, name: file.name, status: "ready", family: id };
      } catch (error) {
        if (generation.current !== currentGeneration) return;
        result = {
          id,
          name: file.name,
          status: "error",
          message:
            error instanceof Error ? error.message : "This font could not be loaded.",
        };
      }

      setFonts((previous) =>
        previous.map((font) => (font.id === id ? result : font)),
      );
    }
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    setIsDragging(false);
  }

  return (
    <>
      <section
        aria-label="Select font files"
        className={`drop-zone${isDragging ? " is-dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (event.dataTransfer.files.length > 0) {
            void selectFiles(Array.from(event.dataTransfer.files));
          }
        }}
      >
        <h2>Drop font files here</h2>
        <p className="file-formats">TTF, OTF, WOFF and WOFF2</p>
        <input
          ref={inputRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          multiple
          hidden
          aria-label="Choose font files"
          onChange={(event) => {
            if (event.currentTarget.files?.length) {
              void selectFiles(Array.from(event.currentTarget.files));
            }
            event.currentTarget.value = "";
          }}
        />
        <button
          type="button"
          className="primary-button"
          aria-describedby="selection-note"
          onClick={() => inputRef.current?.click()}
        >
          Choose font files
        </button>
      </section>

      <div className="selection-feedback" role="status" aria-atomic="true">
        <p id="selection-note" className="selection-note">
          {fonts.length > 0
            ? `${readyCount} ${readyCount === 1 ? "font" : "fonts"} ready to preview.${loadingCount > 0 ? ` ${loadingCount} loading.` : ""}${errorCount > 0 ? ` ${errorCount} could not be loaded.` : ""} Refreshing clears your library.`
            : "Preview fonts in this tab. Refreshing clears your library."}
        </p>
      </div>

      <section className="library" aria-labelledby="library-heading">
        <div className="library-heading">
          <h2 id="library-heading">Library</h2>
          <span className="library-count">
            {readyCount} {readyCount === 1 ? "font" : "fonts"}
          </span>
        </div>
        {fonts.length === 0 ? (
          <div className="empty-state">
            <h3>Your collection starts here.</h3>
            <p>Choose a font file to get started.</p>
          </div>
        ) : (
          <ul className="font-list" aria-label="Selected fonts">
            {fonts.map((font) => (
              <li key={font.id} className="font-row" aria-busy={font.status === "loading"}>
                <h3>{font.name}</h3>
                {font.status === "ready" ? (
                  <p className="font-sample" style={{ fontFamily: `"${font.family}"` }}>
                    {SAMPLE_TEXT}
                  </p>
                ) : (
                  <p className={font.status === "error" ? "font-error" : "font-loading"}>
                    {font.status === "error" ? font.message : "Loading font…"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
