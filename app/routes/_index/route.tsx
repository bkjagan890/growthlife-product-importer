import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>GrowthLife Product Importer</h1>
        <p className={styles.text}>
          Bulk import, export and edit all your Shopify products from one screen.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Excel import & export</strong>. Products, variants, prices, stock, SEO, collections and images from one .xlsx file.
          </li>
          <li>
            <strong>All products on one page</strong>. Search, see what is missing and edit everything in a single popup.
          </li>
          <li>
            <strong>Bulk images</strong>. Paste pictures in Excel or drop a folder of images named by handle or SKU.
          </li>
        </ul>
      </div>
    </div>
  );
}
