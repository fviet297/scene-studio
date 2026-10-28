// Topbar dropdown menus ([data-menu]): a trigger button and a role="menu" popover of command
// buttons. Each command keeps its own id and click handler elsewhere; this file only opens and
// closes the popover and moves focus between its items.
(() => {
  const menus = [...document.querySelectorAll("[data-menu]")];
  const triggerOf = (menu) => menu.querySelector("[aria-haspopup]");
  const popOf = (menu) => menu.querySelector(".menu-pop");
  const itemsOf = (menu) => [
    ...popOf(menu).querySelectorAll('[role="menuitem"]:not(:disabled)'),
  ];
  const isOpen = (menu) => !popOf(menu).hidden;

  // A narrow window wraps the topbar, so a trigger can land anywhere: slide the popover back
  // inside the window instead of letting it run off the right edge.
  function keepInViewport(pop) {
    const margin = 8;
    pop.style.translate = "";
    const { left, right } = pop.getBoundingClientRect();
    const shift =
      right > innerWidth - margin
        ? innerWidth - margin - right
        : Math.max(0, margin - left);
    if (shift) pop.style.translate = `${shift}px 0`;
  }

  function setOpen(menu, open) {
    const pop = popOf(menu);
    pop.hidden = !open;
    triggerOf(menu).setAttribute("aria-expanded", String(open));
    if (open) keepInViewport(pop);
  }

  function closeAll(except = null) {
    for (const menu of menus)
      if (menu !== except && isOpen(menu)) setOpen(menu, false);
  }

  function openMenu(menu, itemToFocus = null) {
    closeAll(menu);
    setOpen(menu, true);
    if (itemToFocus !== null) itemsOf(menu).at(itemToFocus)?.focus();
  }

  function onKeydown(menu, e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Tab") return setOpen(menu, false);
    const items = itemsOf(menu);
    const at = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      if (isOpen(menu)) items[(at + 1) % items.length]?.focus();
      else openMenu(menu, 0);
    } else if (e.key === "ArrowUp") {
      if (isOpen(menu))
        items[
          at < 0 ? items.length - 1 : (at - 1 + items.length) % items.length
        ]?.focus();
      else openMenu(menu, -1);
    } else if (isOpen(menu) && e.key === "Home") items[0]?.focus();
    else if (isOpen(menu) && e.key === "End") items.at(-1)?.focus();
    else {
      // Keep the panel's own shortcuts (1/2, j/k, arrows, Space) from firing while a menu has focus.
      if (isOpen(menu)) e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  for (const menu of menus) {
    triggerOf(menu).addEventListener("click", () =>
      isOpen(menu) ? setOpen(menu, false) : openMenu(menu),
    );
    menu.addEventListener("click", (e) => {
      if (e.target.closest('[role="menuitem"]')) setOpen(menu, false);
    });
    menu.addEventListener("keydown", (e) => onKeydown(menu, e));
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-menu]")) closeAll();
  });

  // Capture phase: Escape closes the menu only, not the dialog or notification panel under it.
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      const open = menus.find(isOpen);
      if (!open) return;
      e.stopPropagation();
      if (open.contains(document.activeElement)) triggerOf(open).focus();
      setOpen(open, false);
    },
    true,
  );
})();
