import { extractVariables } from "./prompt-utils.ts";

export const MAX_VARIABLE_NAME_LENGTH = 30;
export const MAX_PROMPT_VARIABLES = 20;

export type VariableInsertResult = {
  content: string;
  variableName: string;
  selectionStart: number;
  selectionEnd: number;
  isExisting: boolean;
};

function normalizeVariableName(rawName: string) {
  return rawName.trim();
}

function getVariableNameLength(name: string) {
  return Array.from(name).length;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceNamedVariable(
  content: string,
  variableName: string,
  replacement: string,
) {
  const pattern = new RegExp(
    `\\{\\{\\s*${escapeRegExp(variableName)}\\s*\\}\\}`,
    "g",
  );

  return content.replace(pattern, replacement);
}

function assertCursorPosition(content: string, cursorIndex: number) {
  if (!Number.isInteger(cursorIndex) || cursorIndex < 0 || cursorIndex > content.length) {
    throw new Error("正文光标位置无效，请重新选择。");
  }
}

export function validateVariableName(
  rawName: string,
  existingNames: readonly string[],
) {
  const name = normalizeVariableName(rawName);

  if (!name) {
    return "变量名不能为空。";
  }

  if (name.includes("{") || name.includes("}")) {
    return "变量名不能包含花括号。";
  }

  if (getVariableNameLength(name) > MAX_VARIABLE_NAME_LENGTH) {
    return `变量名最多 ${MAX_VARIABLE_NAME_LENGTH} 个字符。`;
  }

  if (existingNames.some((existingName) => existingName === name)) {
    return "变量名已存在，请使用其他名称。";
  }

  return null;
}

export function renamePromptVariable(
  content: string,
  currentName: string,
  nextName: string,
) {
  const normalizedCurrentName = normalizeVariableName(currentName);
  const normalizedNextName = normalizeVariableName(nextName);
  const variables = extractVariables(content);

  if (!variables.includes(normalizedCurrentName)) {
    throw new Error("要改名的变量不存在。");
  }

  const validationError = validateVariableName(
    normalizedNextName,
    variables.filter((name) => name !== normalizedCurrentName),
  );

  if (validationError) {
    throw new Error(validationError);
  }

  if (normalizedCurrentName === normalizedNextName) {
    return content;
  }

  return replaceNamedVariable(
    content,
    normalizedCurrentName,
    `{{${normalizedNextName}}}`,
  );
}

export function demotePromptVariable(content: string, variableName: string) {
  const normalizedName = normalizeVariableName(variableName);

  if (!extractVariables(content).includes(normalizedName)) {
    throw new Error("要降级的变量不存在。");
  }

  return replaceNamedVariable(content, normalizedName, normalizedName);
}

export function setSelectionAsVariable(
  content: string,
  selectionStart: number,
  selectionEnd: number,
): VariableInsertResult {
  if (
    !Number.isInteger(selectionStart) ||
    !Number.isInteger(selectionEnd) ||
    selectionStart < 0 ||
    selectionEnd < selectionStart ||
    selectionEnd > content.length
  ) {
    throw new Error("请先在正文中选择要设置为变量的文字。");
  }

  const selectedText = content.slice(selectionStart, selectionEnd);

  if (!selectedText.trim()) {
    throw new Error("请先在正文中选择要设置为变量的文字。");
  }

  if (selectedText.includes("{") || selectedText.includes("}")) {
    throw new Error("选中的文字不能包含花括号。");
  }

  const variableName = normalizeVariableName(selectedText);
  const existingVariables = extractVariables(content);
  const validationError = validateVariableName(
    variableName,
    existingVariables,
  );

  if (validationError) {
    throw new Error(validationError);
  }

  if (existingVariables.length >= MAX_PROMPT_VARIABLES) {
    throw new Error(`最多支持 ${MAX_PROMPT_VARIABLES} 个变量。`);
  }

  const replacement = `{{${variableName}}}`;
  const nextContent = `${content.slice(0, selectionStart)}${replacement}${content.slice(selectionEnd)}`;
  const nextCursor = selectionStart + replacement.length;

  return {
    content: nextContent,
    variableName,
    selectionStart: nextCursor,
    selectionEnd: nextCursor,
    isExisting: false,
  };
}

export function insertPromptVariable(
  content: string,
  cursorIndex: number,
  rawName: string,
): VariableInsertResult {
  assertCursorPosition(content, cursorIndex);

  const variableName = normalizeVariableName(rawName);
  const existingVariables = extractVariables(content);
  const isExisting = existingVariables.includes(variableName);

  if (!isExisting) {
    const validationError = validateVariableName(
      variableName,
      existingVariables,
    );

    if (validationError) {
      throw new Error(validationError);
    }

    if (existingVariables.length >= MAX_PROMPT_VARIABLES) {
      throw new Error(`最多支持 ${MAX_PROMPT_VARIABLES} 个变量。`);
    }
  }

  const replacement = `{{${variableName}}}`;
  const nextContent = `${content.slice(0, cursorIndex)}${replacement}${content.slice(cursorIndex)}`;
  const nextCursor = cursorIndex + replacement.length;

  return {
    content: nextContent,
    variableName,
    selectionStart: nextCursor,
    selectionEnd: nextCursor,
    isExisting,
  };
}

// 保存前校验直接扫描正文，避免用户手工输入空变量或非法变量后绕过编辑操作。
export function validatePromptVariables(content: string) {
  const variableNames: string[] = [];
  const pattern = /\{\{([\s\S]*?)\}\}/g;

  for (const match of content.matchAll(pattern)) {
    const rawName = match[1];
    const variableName = normalizeVariableName(rawName);

    if (!variableName) {
      return "变量名不能为空。";
    }

    if (rawName.includes("{") || rawName.includes("}")) {
      return "变量名不能包含花括号。";
    }

    if (getVariableNameLength(variableName) > MAX_VARIABLE_NAME_LENGTH) {
      return `变量“${variableName}”最多 ${MAX_VARIABLE_NAME_LENGTH} 个字符。`;
    }

    variableNames.push(variableName);
  }

  if (new Set(variableNames).size > MAX_PROMPT_VARIABLES) {
    return `最多支持 ${MAX_PROMPT_VARIABLES} 个变量。`;
  }

  return null;
}
