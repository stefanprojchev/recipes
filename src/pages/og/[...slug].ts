import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { generateOgImage } from "@lib/og";

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getCollection("blog", (entry) => !entry.data.draft);

  const paths = posts.map((post) => ({
    params: { slug: post.id },
    props: {
      title: post.data.title,
      description: post.data.description,
    },
  }));

  // Default OG image — update per project (must match site_name/site_description in messages)
  paths.push({
    params: { slug: "default" },
    props: {
      title: "Project Name",
      description: "Project description goes here.",
    },
  });

  return paths;
};

export const GET: APIRoute = async ({ props }) => {
  const png = await generateOgImage({
    title: props.title,
    description: props.description,
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
