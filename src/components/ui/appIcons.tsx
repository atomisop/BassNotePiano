import { forwardRef, type ComponentType } from "react";
import type { Icon as PhosphorIcon, IconProps } from "@phosphor-icons/react/dist/lib/types";
import {
  ArrowBendUpLeft as PArrowBendUpLeft, ArrowClockwise as PArrowClockwise, ArrowCounterClockwise as PArrowCounterClockwise, ArrowDown as PArrowDown, ArrowLeft as PArrowLeft, ArrowRight as PArrowRight, ArrowUUpLeft as PArrowUUpLeft, ArrowUp as PArrowUp, ArrowUpRight as PArrowUpRight, ArrowsClockwise as PArrowsClockwise, ArrowsLeftRight as PArrowsLeftRight, Bell as PBell, Calendar as PCalendar, CalendarBlank as PCalendarBlank, CalendarCheck as PCalendarCheck, CalendarDots as PCalendarDots, CalendarPlus as PCalendarPlus, CaretDown as PCaretDown, CaretLeft as PCaretLeft, CaretRight as PCaretRight, CaretUp as PCaretUp, ChatCircle as PChatCircle, Check as PCheck, Checks as PChecks, Circle as PCircle, CircleNotch as PCircleNotch, Clipboard as PClipboard, ClipboardText as PClipboardText, Clock as PClock, Coins as PCoins, Confetti as PConfetti, CornersIn as PCornersIn, CornersOut as PCornersOut, CreditCard as PCreditCard, DeviceMobile as PDeviceMobile, DeviceTablet as PDeviceTablet, DotsThreeVertical as PDotsThreeVertical, DownloadSimple as PDownloadSimple, Envelope as PEnvelope, Export as PExport, Eye as PEye, EyeSlash as PEyeSlash, FileText as PFileText, FileVideo as PFileVideo, Fire as PFire, Gear as PGear, Globe as PGlobe, GridFour as PGridFour, Hammer as PHammer, Headset as PHeadset, Hourglass as PHourglass, House as PHouse, Info as PInfo, Key as PKey, Laptop as PLaptop, Lifebuoy as PLifebuoy, Lightbulb as PLightbulb, LinkBreak as PLinkBreak, List as PList, ListChecks as PListChecks, Lock as PLock, MagnifyingGlass as PMagnifyingGlass, MagnifyingGlassMinus as PMagnifyingGlassMinus, MagnifyingGlassPlus as PMagnifyingGlassPlus, MapPin as PMapPin, MapTrifold as PMapTrifold, Medal as PMedal, Megaphone as PMegaphone, Minus as PMinus, Moon as PMoon, MusicNotes as PMusicNotes, Notebook as PNotebook, Palette as PPalette, PaperPlaneTilt as PPaperPlaneTilt, Paperclip as PPaperclip, Pause as PPause, PencilSimple as PPencilSimple, Phone as PPhone, Play as PPlay, PlayCircle as PPlayCircle, Plus as PPlus, PlusSquare as PPlusSquare, Prohibit as PProhibit, PushPin as PPushPin, Shield as PShield, ShieldCheck as PShieldCheck, ShoppingBag as PShoppingBag, SidebarSimple as PSidebarSimple, SignOut as PSignOut, Siren as PSiren, Smiley as PSmiley, Sparkle as PSparkle, SpeakerHigh as PSpeakerHigh, SpeakerX as PSpeakerX, Square as PSquare, SquaresFour as PSquaresFour, Stack as PStack, Star as PStar, Sun as PSun, Table as PTable, ThumbsDown as PThumbsDown, ThumbsUp as PThumbsUp, Ticket as PTicket, Timer as PTimer, Trash as PTrash, Tray as PTray, Trophy as PTrophy, UploadSimple as PUploadSimple, User as PUser, UserPlus as PUserPlus, Users as PUsers, VideoCamera as PVideoCamera, Warning as PWarning, WarningCircle as PWarningCircle, Wrench as PWrench, X as PX,
} from "@phosphor-icons/react/dist/ssr";

/**
 * The app's icons, in one place. Every screen imports its icons from here (never from an icon package directly), so the whole look can
 * change in this file alone. They are Phosphor's duotone icons: rounded shapes with a soft tinted fill inside, friendlier than plain line
 * icons (chosen 2026-10-30). The names are the ones the screens already used, so nothing else had to learn new names.
 *
 * - `fill` set to a color (the lit flame, a filled star) draws the solid version instead.
 * - Plain marks (arrows, chevrons, close, check, plus) are bold lines (`LINE_MARKS`): a duotone chevron reads as a play button.
 * - `strokeWidth` is accepted and ignored (Phosphor draws its own weights), so older call sites keep working.
 * - An icon is hidden from screen readers unless it has its own label, the same as before.
 * - The server-safe build is used, so these work in server and client components alike.
 */
export type AppIconProps = IconProps & { strokeWidth?: number | string };
export type AppIcon = ComponentType<AppIconProps>;

/** Plain marks (arrows, chevrons, close, check, plus, minus) have no inside to tint, so they draw as bold lines rather than duotone. */
const LINE_MARKS = new Set([
  "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowUpRight", "ArrowRightLeft", "MoveRight", "Check", "CheckCheck",
  "ChevronDown", "ChevronLeft", "ChevronRight", "ChevronUp", "Minus", "Plus", "X", "Reply", "Undo2", "RotateCcw", "RotateCw", "RefreshCw",
]);

function soft(Glyph: PhosphorIcon, name: string): AppIcon {
  const base = LINE_MARKS.has(name) ? "bold" : "duotone";
  const Icon = forwardRef<SVGSVGElement, AppIconProps>(function Icon({ strokeWidth, fill, weight, size = 24, ...rest }, ref) {
    void strokeWidth;
    const solid = fill !== undefined && fill !== "none";
    const labelled = Boolean(rest["aria-label"] || rest["aria-labelledby"]);
    return <Glyph ref={ref} size={size} weight={weight ?? (solid ? "fill" : base)} aria-hidden={labelled ? rest["aria-hidden"] : (rest["aria-hidden"] ?? true)} {...rest} />;
  });
  Icon.displayName = name;
  return Icon;
}

export const AlertCircle = soft(PWarningCircle, "AlertCircle");
export const AlertTriangle = soft(PWarning, "AlertTriangle");
export const ArrowDown = soft(PArrowDown, "ArrowDown");
export const ArrowLeft = soft(PArrowLeft, "ArrowLeft");
export const ArrowRight = soft(PArrowRight, "ArrowRight");
export const ArrowRightLeft = soft(PArrowsLeftRight, "ArrowRightLeft");
export const ArrowUp = soft(PArrowUp, "ArrowUp");
export const ArrowUpRight = soft(PArrowUpRight, "ArrowUpRight");
export const Ban = soft(PProhibit, "Ban");
export const Bell = soft(PBell, "Bell");
export const Calendar = soft(PCalendar, "Calendar");
export const CalendarCheck = soft(PCalendarCheck, "CalendarCheck");
export const CalendarClock = soft(PCalendarDots, "CalendarClock");
export const CalendarCog = soft(PCalendarBlank, "CalendarCog");
export const CalendarDays = soft(PCalendarDots, "CalendarDays");
export const CalendarPlus = soft(PCalendarPlus, "CalendarPlus");
export const Check = soft(PCheck, "Check");
export const CheckCheck = soft(PChecks, "CheckCheck");
export const ChevronDown = soft(PCaretDown, "ChevronDown");
export const ChevronLeft = soft(PCaretLeft, "ChevronLeft");
export const ChevronRight = soft(PCaretRight, "ChevronRight");
export const ChevronUp = soft(PCaretUp, "ChevronUp");
export const Circle = soft(PCircle, "Circle");
export const ClipboardCheck = soft(PClipboard, "ClipboardCheck");
export const ClipboardList = soft(PClipboardText, "ClipboardList");
export const Clock = soft(PClock, "Clock");
export const Coins = soft(PCoins, "Coins");
export const CreditCard = soft(PCreditCard, "CreditCard");
export const Download = soft(PDownloadSimple, "Download");
export const EllipsisVertical = soft(PDotsThreeVertical, "EllipsisVertical");
export const Eye = soft(PEye, "Eye");
export const EyeOff = soft(PEyeSlash, "EyeOff");
export const FileText = soft(PFileText, "FileText");
export const FileVideo = soft(PFileVideo, "FileVideo");
export const Flame = soft(PFire, "Flame");
export const Globe = soft(PGlobe, "Globe");
export const Hammer = soft(PHammer, "Hammer");
export const Headset = soft(PHeadset, "Headset");
export const Home = soft(PHouse, "Home");
export const Hourglass = soft(PHourglass, "Hourglass");
export const Inbox = soft(PTray, "Inbox");
export const Info = soft(PInfo, "Info");
export const KeyRound = soft(PKey, "KeyRound");
export const Laptop = soft(PLaptop, "Laptop");
export const Layers = soft(PStack, "Layers");
export const LayoutDashboard = soft(PSquaresFour, "LayoutDashboard");
export const LayoutGrid = soft(PGridFour, "LayoutGrid");
export const LifeBuoy = soft(PLifebuoy, "LifeBuoy");
export const Lightbulb = soft(PLightbulb, "Lightbulb");
export const Link2Off = soft(PLinkBreak, "Link2Off");
export const List = soft(PList, "List");
export const ListChecks = soft(PListChecks, "ListChecks");
export const LoaderIcon = soft(PCircleNotch, "LoaderIcon");
export const Lock = soft(PLock, "Lock");
export const Mail = soft(PEnvelope, "Mail");
export const Map = soft(PMapTrifold, "Map");
export const MapPin = soft(PMapPin, "MapPin");
export const Maximize = soft(PCornersOut, "Maximize");
export const Medal = soft(PMedal, "Medal");
export const Megaphone = soft(PMegaphone, "Megaphone");
export const MessageSquare = soft(PChatCircle, "MessageSquare");
export const Minimize = soft(PCornersIn, "Minimize");
export const Minus = soft(PMinus, "Minus");
export const Moon = soft(PMoon, "Moon");
export const MoveRight = soft(PArrowRight, "MoveRight");
export const Music2 = soft(PMusicNotes, "Music2");
export const NotebookPen = soft(PNotebook, "NotebookPen");
export const PanelLeft = soft(PSidebarSimple, "PanelLeft");
export const PanelLeftClose = soft(PSidebarSimple, "PanelLeftClose");
export const PanelLeftOpen = soft(PSidebarSimple, "PanelLeftOpen");
export const Paperclip = soft(PPaperclip, "Paperclip");
export const PartyPopper = soft(PConfetti, "PartyPopper");
export const Pause = soft(PPause, "Pause");
export const Pencil = soft(PPencilSimple, "Pencil");
export const Phone = soft(PPhone, "Phone");
export const Play = soft(PPlay, "Play");
export const PlayCircle = soft(PPlayCircle, "PlayCircle");
export const Plus = soft(PPlus, "Plus");
export const RefreshCw = soft(PArrowsClockwise, "RefreshCw");
export const Reply = soft(PArrowBendUpLeft, "Reply");
export const RotateCcw = soft(PArrowCounterClockwise, "RotateCcw");
export const RotateCw = soft(PArrowClockwise, "RotateCw");
export const Search = soft(PMagnifyingGlass, "Search");
export const SearchIcon = soft(PMagnifyingGlass, "SearchIcon");
export const Send = soft(PPaperPlaneTilt, "Send");
export const Settings = soft(PGear, "Settings");
export const Share = soft(PExport, "Share");
export const Shield = soft(PShield, "Shield");
export const ShieldCheck = soft(PShieldCheck, "ShieldCheck");
export const Siren = soft(PSiren, "Siren");
export const Smartphone = soft(PDeviceMobile, "Smartphone");
export const Sparkles = soft(PSparkle, "Sparkles");
export const Square = soft(PSquare, "Square");
export const SquarePlus = soft(PPlusSquare, "SquarePlus");
export const Star = soft(PStar, "Star");
export const Sun = soft(PSun, "Sun");
export const Table2 = soft(PTable, "Table2");
export const Tablet = soft(PDeviceTablet, "Tablet");
export const Ticket = soft(PTicket, "Ticket");
export const Timer = soft(PTimer, "Timer");
export const Trash2 = soft(PTrash, "Trash2");
export const TriangleAlert = soft(PWarning, "TriangleAlert");
export const Trophy = soft(PTrophy, "Trophy");
export const Undo2 = soft(PArrowUUpLeft, "Undo2");
export const Users = soft(PUsers, "Users");
export const Video = soft(PVideoCamera, "Video");
export const Volume2 = soft(PSpeakerHigh, "Volume2");
export const VolumeX = soft(PSpeakerX, "VolumeX");
export const Wrench = soft(PWrench, "Wrench");
export const X = soft(PX, "X");
export const ZoomIn = soft(PMagnifyingGlassPlus, "ZoomIn");
export const ZoomOut = soft(PMagnifyingGlassMinus, "ZoomOut");
export const User = soft(PUser, "User");
export const Palette = soft(PPalette, "Palette");
export const ShoppingBag = soft(PShoppingBag, "ShoppingBag");
export const SignOut = soft(PSignOut, "SignOut");
export const Smiley = soft(PSmiley, "Smiley");
export const UserPlus = soft(PUserPlus, "UserPlus");
export const UploadSimple = soft(PUploadSimple, "UploadSimple");
export const PushPin = soft(PPushPin, "PushPin");
export const ThumbsUp = soft(PThumbsUp, "ThumbsUp");
export const ThumbsDown = soft(PThumbsDown, "ThumbsDown");
