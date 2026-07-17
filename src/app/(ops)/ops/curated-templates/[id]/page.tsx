"use client";

import { use } from "react";
import TemplateEditor from "../TemplateEditor";

export default function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TemplateEditor templateId={id} />;
}
