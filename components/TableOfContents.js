import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";

export function TableOfContents() {
  const [headings, setHeadings] = useState([]);
  const [activeId, setActiveId] = useState("");
  const clickedRef = useRef(false);
  const router = useRouter();
  const currentPath = router.asPath.split("#")[0].split("?")[0];

  // Extract H2 and H3 headings from the DOM after render and after runtime docs load.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const article = document.querySelector(".layout-content article");
    if (!article) {
      setHeadings([]);
      return undefined;
    }

    const collectHeadings = () => {
      const elements = article.querySelectorAll("h2, h3, h4");
      const items = Array.from(elements).map((el) => {
        if (!el.id) {
          el.id = el.textContent
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
        }
        return {
          id: el.id,
          text: el.textContent,
          level: Number(el.tagName.slice(1)),
        };
      });
      setHeadings(items);
      setActiveId("");
    };

    collectHeadings();

    const observer = new MutationObserver(collectHeadings);
    observer.observe(article, { childList: true, subtree: true });
    window.addEventListener("remote-docs:loaded", collectHeadings);

    return () => {
      observer.disconnect();
      window.removeEventListener("remote-docs:loaded", collectHeadings);
    };
  }, [currentPath]);

  // Scroll spy using scroll position
  const updateActiveHeading = useCallback(() => {
    if (clickedRef.current || headings.length === 0) return;

    const scrollY = window.scrollY;
    const windowHeight = window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;
    const offset = windowHeight * 0.35;

    // If scrolled to the bottom, activate the last heading
    if (scrollY + windowHeight >= docHeight - 10) {
      setActiveId(headings[headings.length - 1].id);
      return;
    }

    // Find the last heading that has scrolled past the offset
    let current = "";
    for (const { id } of headings) {
      const el = document.getElementById(id);
      if (el) {
        const top = el.getBoundingClientRect().top;
        if (top <= offset) {
          current = id;
        } else {
          break;
        }
      }
    }

    if (current) {
      setActiveId(current);
    }
  }, [headings]);

  useEffect(() => {
    if (headings.length === 0) return;

    // Run once on mount to set initial active heading
    updateActiveHeading();

    window.addEventListener("scroll", updateActiveHeading, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateActiveHeading);
    };
  }, [headings, updateActiveHeading]);

  if (headings.length < 2) return null;

  return (
    <nav className="toc" aria-label="Table of contents">
      <div className="toc-list">
        {headings.map(({ id, text, level }) => (
          <div
            key={id}
            className={`toc-item${activeId === id ? " toc-item-active" : ""}`}
          >
            <a
              href={`#${id}`}
              className={`toc-link${level === 3 ? " toc-link-h3" : ""}${
                level === 4 ? " toc-link-h4" : ""
              }${activeId === id ? " toc-link-active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                const target = document.getElementById(id);
                if (target) {
                  clickedRef.current = true;
                  setActiveId(id);
                  target.scrollIntoView({ behavior: "smooth", block: "start" });
                  history.pushState(null, "", `#${id}`);
                  setTimeout(() => {
                    clickedRef.current = false;
                  }, 800);
                }
              }}
            >
              {text}
            </a>
          </div>
        ))}
      </div>
    </nav>
  );
}
