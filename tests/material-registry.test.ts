import { describe, it, expect, beforeEach } from "vitest";
import { buffCV, stringAsciiCV, stringUtf8CV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_HASH = 101;
const ERR_INVALID_TITLE = 102;
const ERR_MATERIAL_ALREADY_EXITS = 106;
const ERR_MATERIAL_NOT_FOUND = 107;
const ERR_AUTHORITY_NOT_VERIFIED = 109;
const ERR_INVALID_DESCRIPTION = 110;
const ERR_INVALID_CATEGORY = 111;
const ERR_INVALID_LANGUAGE = 115;
const ERR_INVALID_FORMAT = 116;
const ERR_MAX_MATERIALS_EXCEEDED = 114;

interface Material {
  contentHash: Uint8Array;
  title: string;
  author: string;
  description: string;
  category: string;
  language: string;
  format: string;
  timestamp: number;
  status: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class MaterialRegistryMock {
  state: {
    nextMaterialId: number;
    maxMaterials: number;
    registrationFee: number;
    authorityContract: string | null;
    materials: Map<number, Material>;
    materialsByHash: Map<string, number>;
  } = {
    nextMaterialId: 0,
    maxMaterials: 10000,
    registrationFee: 500,
    authorityContract: null,
    materials: new Map(),
    materialsByHash: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  reset() {
    this.state = {
      nextMaterialId: 0,
      maxMaterials: 10000,
      registrationFee: 500,
      authorityContract: null,
      materials: new Map(),
      materialsByHash: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") return { ok: false, value: false };
    if (this.state.authorityContract !== null) return { ok: false, value: false };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setRegistrationFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.registrationFee = newFee;
    return { ok: true, value: true };
  }

  registerMaterial(hash: Uint8Array, title: string, desc: string, cat: string, lang: string, fmt: string): Result<number> {
    if (this.state.nextMaterialId >= this.state.maxMaterials) return { ok: false, value: ERR_MAX_MATERIALS_EXCEEDED };
    if (hash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (!title || title.length > 100) return { ok: false, value: ERR_INVALID_TITLE };
    if (desc.length > 500) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (!cat || cat.length > 50) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (!lang || lang.length > 20) return { ok: false, value: ERR_INVALID_LANGUAGE };
    if (!["PDF", "VIDEO", "TEXT", "AUDIO"].includes(fmt)) return { ok: false, value: ERR_INVALID_FORMAT };
    const hashKey = hash.toString();
    if (this.state.materialsByHash.has(hashKey)) return { ok: false, value: ERR_MATERIAL_ALREADY_EXITS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.registrationFee, from: this.caller, to: this.state.authorityContract });
    const id = this.state.nextMaterialId;
    const material: Material = { contentHash: hash, title, author: this.caller, description: desc, category: cat, language: lang, format: fmt, timestamp: this.blockHeight, status: true };
    this.state.materials.set(id, material);
    this.state.materialsByHash.set(hashKey, id);
    this.state.nextMaterialId++;
    return { ok: true, value: id };
  }

  getMaterial(id: number): Material | null {
    return this.state.materials.get(id) || null;
  }

  updateMaterial(id: number, newTitle: string, newDesc: string): Result<boolean> {
    const material = this.state.materials.get(id);
    if (!material) return { ok: false, value: false };
    if (material.author !== this.caller) return { ok: false, value: false };
    if (!newTitle || newTitle.length > 100) return { ok: false, value: false };
    if (newDesc.length > 500) return { ok: false, value: false };
    this.state.materials.set(id, { ...material, title: newTitle, description: newDesc, timestamp: this.blockHeight });
    return { ok: true, value: true };
  }

  verifyMaterial(hash: Uint8Array): Result<Material | null> {
    const hashKey = hash.toString();
    const id = this.state.materialsByHash.get(hashKey);
    if (id === undefined) return { ok: false, value: null };
    return { ok: true, value: this.state.materials.get(id) || null };
  }

  deactivateMaterial(id: number): Result<boolean> {
    const material = this.state.materials.get(id);
    if (!material) return { ok: false, value: false };
    if (material.author !== this.caller) return { ok: false, value: false };
    this.state.materials.set(id, { ...material, status: false });
    return { ok: true, value: true };
  }

  getMaterialCount(): Result<number> {
    return { ok: true, value: this.state.nextMaterialId };
  }

  getMaterialByHash(hash: Uint8Array): Material | null {
    const hashKey = hash.toString();
    const id = this.state.materialsByHash.get(hashKey);
    if (id === undefined) return null;
    return this.state.materials.get(id) || null;
  }
}

describe("MaterialRegistry", () => {
  let contract: MaterialRegistryMock;

  beforeEach(() => {
    contract = new MaterialRegistryMock();
    contract.reset();
  });

  it("registers material successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    const result = contract.registerMaterial(hash, "Cultural Lesson", "Traditional weaving techniques", "Education", "EN", "PDF");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const material = contract.getMaterial(0);
    expect(material?.title).toBe("Cultural Lesson");
    expect(material?.description).toBe("Traditional weaving techniques");
    expect(material?.category).toBe("Education");
    expect(material?.language).toBe("EN");
    expect(material?.format).toBe("PDF");
    expect(material?.status).toBe(true);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate material hash", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    contract.registerMaterial(hash, "Lesson 1", "Desc 1", "Edu", "EN", "PDF");
    const result = contract.registerMaterial(hash, "Lesson 2", "Desc 2", "Sci", "FR", "VIDEO");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MATERIAL_ALREADY_EXITS);
  });

  it("rejects invalid hash", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(31).fill(1);
    const result = contract.registerMaterial(hash, "Title", "Desc", "Edu", "EN", "PDF");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it("rejects invalid title", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    const result = contract.registerMaterial(hash, "", "Desc", "Edu", "EN", "PDF");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TITLE);
  });

  it("updates material successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    contract.registerMaterial(hash, "Old Title", "Old Desc", "Edu", "EN", "PDF");
    const result = contract.updateMaterial(0, "New Title", "New Desc");
    expect(result.ok).toBe(true);
    const material = contract.getMaterial(0);
    expect(material?.title).toBe("New Title");
    expect(material?.description).toBe("New Desc");
  });

  it("rejects update by non-author", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    contract.registerMaterial(hash, "Title", "Desc", "Edu", "EN", "PDF");
    contract.caller = "ST3FAKE";
    const result = contract.updateMaterial(0, "New Title", "New Desc");
    expect(result.ok).toBe(false);
  });

  it("verifies material successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    contract.registerMaterial(hash, "Title", "Desc", "Edu", "EN", "PDF");
    const result = contract.verifyMaterial(hash);
    expect(result.ok).toBe(true);
    expect(result.value?.title).toBe("Title");
  });

  it("deactivates material successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    contract.registerMaterial(hash, "Title", "Desc", "Edu", "EN", "PDF");
    const result = contract.deactivateMaterial(0);
    expect(result.ok).toBe(true);
    const material = contract.getMaterial(0);
    expect(material?.status).toBe(false);
  });
});