import {
  TooltipPopup,
  TooltipPositioner,
  TooltipRoot,
  TooltipTrigger,
} from "prosekit/react/tooltip";
import type { MouseEventHandler, ReactNode } from "react";

export default function Button(props: {
  pressed?: boolean;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  tooltip?: string;
  children: ReactNode;
}) {
  return (
    <TooltipRoot>
      <TooltipTrigger className="block">
        <button
          data-state={props.pressed ? "on" : "off"}
          disabled={props.disabled}
          onClick={props.onClick}
          onMouseDown={(event) => {
            // Prevent the editor from being blurred when the button is clicked
            event.preventDefault();
          }}
          className="flex min-h-9 min-w-9 items-center justify-center rounded-md bg-transparent p-2 font-medium text-gray-900 text-sm outline-unset transition hover:bg-gray-100 focus-visible:outline-unset focus-visible:ring-2 focus-visible:ring-gray-900 disabled:pointer-events-none disabled:text-gray-900/50 data-[state=on]:bg-gray-200 dark:text-gray-50 dark:data-[state=on]:bg-gray-700 dark:disabled:text-gray-50/50 dark:focus-visible:ring-gray-300 dark:hover:bg-gray-800"
        >
          {props.children}
          {props.tooltip ? (
            <span className="sr-only">{props.tooltip}</span>
          ) : null}
        </button>
      </TooltipTrigger>
      {props.tooltip ? (
        <TooltipPositioner className="z-50 block h-min w-min overflow-visible transition-transform duration-100 ease-out motion-reduce:transition-none">
          <TooltipPopup className="box-border flex origin-(--transform-origin) starting:scale-95 overflow-hidden text-nowrap rounded-md border border-solid bg-gray-900 px-3 py-1.5 text-gray-50 text-xs starting:opacity-0 shadow-xs transition-[opacity,scale] transition-discrete duration-100 data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=closed]:duration-150 motion-reduce:transition-none dark:bg-gray-50 dark:text-gray-900">
            {props.tooltip}
          </TooltipPopup>
        </TooltipPositioner>
      ) : null}
    </TooltipRoot>
  );
}
