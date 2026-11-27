// The dashboard draws some of its buttons to Figma shapes the Button variants don't have (chooser
// cards, rail rows, draft-bar segments, calendar days). They still use the Button primitive
// (CORE-B-18) — its link variant, the plainest — with this reset first, so the caller's own classes
// draw the shape: no minimum height or side padding, the surrounding font, no underline or press
// shrink, and the label wrapper out of the layout (`contents`) so flex and grid apply to the
// caller's children. The link variant squares the corners with `!rounded-none`, so a caller sets
// its radius as `!rounded-…`. Use: <Button variant="link" className={cn(PLAIN_BUTTON, '…')}>.
export const PLAIN_BUTTON =
  'min-h-0 px-0 [font-family:inherit] font-normal no-underline hover:no-underline active:scale-100 [&>span]:contents'
