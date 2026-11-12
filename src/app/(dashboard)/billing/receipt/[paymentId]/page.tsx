import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import { getServerAuthSession } from "@/lib/auth";
import { loadPaymentReceipt } from "@/lib/paymentReceipt";
import { PageBack } from "@/components/ui/BackLink";
import { PrintReceiptButton } from "@/components/billing/PrintReceiptButton";

export const metadata = { title: "Receipt" };

/** A payment's receipt, to keep or print. Only the person who paid (or an admin) can open it; anyone else gets a 404. */
export default async function ReceiptPage(props: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await props.params;
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/login?callbackUrl=/billing/receipt/${encodeURIComponent(paymentId)}`);

  const loaded = await loadPaymentReceipt(paymentId);
  if (!loaded || (loaded.userId !== session.user.id && session.user.role !== "ADMIN")) notFound();
  const { receipt } = loaded;

  return (
    <div className="mx-auto max-w-xl">
      <PageBack href="/billing/history" className="mb-4" />

      {/* The paper: the same on screen and on the printed page. */}
      <article aria-labelledby="receipt-title" className="print-only-receipt rounded-card bg-neu-base p-6 sm:p-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo-mark.png" alt="" width={40} height={40} className="rounded-xl" />
            <p className="text-body font-semibold text-slate-50">Bass Note Piano</p>
          </div>
          <p className="text-small tabular-nums text-slate-400">{receipt.number}</p>
        </header>

        <h1 id="receipt-title" className="mt-8 text-small font-medium text-slate-400">
          {receipt.title}
        </h1>
        <p className="mt-1 text-figure font-semibold tabular-nums leading-none text-slate-50">{receipt.amountLabel}</p>
        <p className="mt-2 text-body text-slate-300">Paid {receipt.paidOn}</p>

        <table className="mt-8 w-full text-body">
          <caption className="sr-only">What was paid for</caption>
          <tbody>
            <tr>
              <th scope="row" className="py-3 text-left font-normal text-slate-200">
                {receipt.item}
              </th>
              <td className="py-3 text-right tabular-nums text-slate-200">{receipt.amountLabel}</td>
            </tr>
            <tr className="border-t border-(--neu-edge)">
              <th scope="row" className="py-3 text-left font-semibold text-slate-50">
                Total paid
              </th>
              <td className="py-3 text-right font-semibold tabular-nums text-slate-50">{receipt.amountLabel}</td>
            </tr>
          </tbody>
        </table>

        <dl className="mt-6 divide-y divide-(--neu-edge) rounded-control bg-neu-lift px-4 text-small">
          {receipt.rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-400">{row.label}</dt>
              <dd className="text-right tabular-nums text-slate-100">{row.value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-6 text-small text-slate-500">Questions about this payment? Write to music@bassnotepiano.com.</p>
      </article>

      <div className="mt-5 print:hidden">
        <PrintReceiptButton />
      </div>
    </div>
  );
}
