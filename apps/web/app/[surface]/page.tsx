import { notFound } from 'next/navigation';

import { getProductView } from '../product-model';

import { ProductShell } from '../product-shell';

export default async function SurfacePage({
  params,
}: Readonly<{
  params: Promise<{
    surface: string;
  }>;
}>) {
  const { surface } = await params;
  const view = getProductView(surface);
  if (!view || view.id === 'home') {
    notFound();
  }
  return <ProductShell initialView={view.id} />;
}
