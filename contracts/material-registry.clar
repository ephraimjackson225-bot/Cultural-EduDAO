(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-HASH u101)
(define-constant ERR-INVALID-TITLE u102)
(define-constant ERR-MATERIAL-ALREADY-EXISTS u106)
(define-constant ERR-MATERIAL-NOT-FOUND u107)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u109)
(define-constant ERR-INVALID-DESCRIPTION u110)
(define-constant ERR-INVALID-CATEGORY u111)
(define-constant ERR-INVALID-LANGUAGE u115)
(define-constant ERR-INVALID-FORMAT u116)
(define-constant ERR-MAX-MATERIALS-EXCEEDED u114)

(define-data-var next-material-id uint u0)
(define-data-var max-materials uint u10000)
(define-data-var registration-fee uint u500)
(define-data-var authority-contract (optional principal) none)

(define-map materials
  uint
  { content-hash: (buff 32), title: (string-ascii 100), author: principal, description: (string-utf8 500),
    category: (string-ascii 50), language: (string-ascii 20), format: (string-ascii 20), timestamp: uint, status: bool })

(define-map materials-by-hash (buff 32) uint)

(define-read-only (get-material (id uint))
  (map-get? materials id))

(define-read-only (is-material-registered (hash (buff 32)))
  (is-some (map-get? materials-by-hash hash)))

(define-private (validate-hash (hash (buff 32)))
  (if (is-eq (len hash) u32) (ok true) (err ERR-INVALID-HASH)))

(define-private (validate-title (title (string-ascii 100)))
  (if (and (> (len title) u0) (<= (len title) u100)) (ok true) (err ERR-INVALID-TITLE)))

(define-private (validate-author (author principal))
  (if (not (is-eq author 'SP000000000000000000002Q6VF78)) (ok true) (err ERR-NOT-AUTHORIZED)))

(define-private (validate-description (desc (string-utf8 500)))
  (if (<= (len desc) u500) (ok true) (err ERR-INVALID-DESCRIPTION)))

(define-private (validate-category (cat (string-ascii 50)))
  (if (and (> (len cat) u0) (<= (len cat) u50)) (ok true) (err ERR-INVALID-CATEGORY)))

(define-private (validate-language (lang (string-ascii 20)))
  (if (and (> (len lang) u0) (<= (len lang) u20)) (ok true) (err ERR-INVALID-LANGUAGE)))

(define-private (validate-format (fmt (string-ascii 20)))
  (if (or (is-eq fmt "PDF") (is-eq fmt "VIDEO") (is-eq fmt "TEXT") (is-eq fmt "AUDIO"))
      (ok true) (err ERR-INVALID-FORMAT)))

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-author contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)))

(define-public (set-registration-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-MATERIAL-NOT-FOUND))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set registration-fee new-fee)
    (ok true)))

(define-public (register-material
  (hash (buff 32)) (title (string-ascii 100)) (desc (string-utf8 500))
  (cat (string-ascii 50)) (lang (string-ascii 20)) (fmt (string-ascii 20)))
  (let ((next-id (var-get next-material-id)) (authority (var-get authority-contract)))
    (asserts! (< next-id (var-get max-materials)) (err ERR-MAX-MATERIALS-EXCEEDED))
    (try! (validate-hash hash))
    (try! (validate-title title))
    (try! (validate-description desc))
    (try! (validate-category cat))
    (try! (validate-language lang))
    (try! (validate-format fmt))
    (asserts! (is-none (map-get? materials-by-hash hash)) (err ERR-MATERIAL-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get registration-fee) tx-sender authority-recipient)))
    (map-set materials next-id
      { content-hash: hash, title: title, author: tx-sender, description: desc,
        category: cat, language: lang, format: fmt, timestamp: block-height, status: true })
    (map-set materials-by-hash hash next-id)
    (var-set next-material-id (+ next-id u1))
    (print { event: "material-registered", id: next-id })
    (ok next-id)))

(define-public (update-material (material-id uint) (new-title (string-ascii 100)) (new-desc (string-utf8 500)))
  (let ((material (map-get? materials material-id)))
    (match material
      m (begin
          (asserts! (is-eq (get author m) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-title new-title))
          (try! (validate-description new-desc))
          (map-set materials material-id
            (merge m { title: new-title, description: new-desc, timestamp: block-height }))
          (print { event: "material-updated", id: material-id })
          (ok true))
      (err ERR-MATERIAL-NOT-FOUND))))

(define-public (verify-material (hash (buff 32)))
  (match (map-get? materials-by-hash hash)
    id (ok (map-get? materials id))
    (err ERR-MATERIAL-NOT-FOUND)))

(define-public (deactivate-material (id uint))
  (let ((material (map-get? materials id)))
    (match material
      m (begin
          (asserts! (is-eq (get author m) tx-sender) (err ERR-NOT-AUTHORIZED))
          (map-set materials id (merge m { status: false }))
          (ok true))
      (err ERR-MATERIAL-NOT-FOUND))))

(define-public (get-material-count)
  (ok (var-get next-material-id)))

(define-read-only (get-material-by-hash (hash (buff 32)))
  (match (map-get? materials-by-hash hash)
    id (map-get? materials id)
    none))