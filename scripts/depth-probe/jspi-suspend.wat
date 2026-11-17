;; 纯浏览器级 JSPI 探针：不经过 Emscripten。
;; 每 64 层调用一次 env.suspend，JS 侧用 WebAssembly.Suspending 包装它，
;; 导出函数用 WebAssembly.promising 包装。用来直接观察 JSPI 栈是否比原生栈更深。
(module
  (import "env" "suspend" (func $suspend))
  (func $rec (export "yield_probe") (param $n i32) (result i32)
    (if (result i32) (i32.eqz (local.get $n))
      (then (i32.const 0))
      (else
        (if (i32.eqz (i32.and (local.get $n) (i32.const 63)))
          (then (call $suspend))
        )
        (i32.add
          (call $rec (i32.sub (local.get $n) (i32.const 1)))
          (i32.const 1)
        )
      )
    )
  )
)
