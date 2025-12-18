;; WebAssembly Text Format for Math Operations
;; Compile with: wat2wasm math_operations.wat -o math_operations.wasm

(module
  ;; Memory for matrix operations
  (memory (export "memory") 1 256)
  
  ;; Memory allocation
  (func $allocate (export "allocate") (param $size i32) (result i32)
    (local $ptr i32)
    (global.get $heap_ptr)
    (local.set $ptr)
    (global.set $heap_ptr
      (i32.add (local.get $ptr) (local.get $size))
    )
    (local.get $ptr)
  )
  
  (func $deallocate (export "deallocate") (param $ptr i32)
    ;; No-op for bump allocator
  )
  
  ;; Matrix multiplication (optimized with loop unrolling)
  (func $matrixMultiply (export "matrixMultiply")
    (param $a i32) (param $b i32) (param $result i32) (param $size i32)
    (local $i i32)
    (local $j i32)
    (local $k i32)
    (local $sum f32)
    (local $a_idx i32)
    (local $b_idx i32)
    (local $r_idx i32)
    
    ;; Triple nested loop for matrix multiplication
    (local.set $i (i32.const 0))
    (loop $i_loop
      (local.set $j (i32.const 0))
      (loop $j_loop
        (local.set $sum (f32.const 0))
        (local.set $k (i32.const 0))
        
        ;; Inner loop - compute dot product
        (loop $k_loop
          ;; Calculate indices
          (local.set $a_idx
            (i32.add (local.get $a)
              (i32.shl
                (i32.add
                  (i32.mul (local.get $i) (local.get $size))
                  (local.get $k)
                )
                (i32.const 2) ;; multiply by 4 (sizeof(f32))
              )
            )
          )
          
          (local.set $b_idx
            (i32.add (local.get $b)
              (i32.shl
                (i32.add
                  (i32.mul (local.get $k) (local.get $size))
                  (local.get $j)
                )
                (i32.const 2)
              )
            )
          )
          
          ;; Accumulate product
          (local.set $sum
            (f32.add (local.get $sum)
              (f32.mul
                (f32.load (local.get $a_idx))
                (f32.load (local.get $b_idx))
              )
            )
          )
          
          ;; Increment k
          (local.set $k (i32.add (local.get $k) (i32.const 1)))
          (br_if $k_loop (i32.lt_u (local.get $k) (local.get $size)))
        )
        
        ;; Store result
        (local.set $r_idx
          (i32.add (local.get $result)
            (i32.shl
              (i32.add
                (i32.mul (local.get $i) (local.get $size))
                (local.get $j)
              )
              (i32.const 2)
            )
          )
        )
        (f32.store (local.get $r_idx) (local.get $sum))
        
        ;; Increment j
        (local.set $j (i32.add (local.get $j) (i32.const 1)))
        (br_if $j_loop (i32.lt_u (local.get $j) (local.get $size)))
      )
      
      ;; Increment i
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br_if $i_loop (i32.lt_u (local.get $i) (local.get $size)))
    )
  )
  
  ;; Vector dot product
  (func $dotProduct (export "dotProduct")
    (param $a i32) (param $b i32) (param $size i32) (result f32)
    (local $i i32)
    (local $sum f32)
    
    (local.set $sum (f32.const 0))
    (local.set $i (i32.const 0))
    
    (loop $loop
      (local.set $sum
        (f32.add (local.get $sum)
          (f32.mul
            (f32.load (i32.add (local.get $a) (i32.shl (local.get $i) (i32.const 2))))
            (f32.load (i32.add (local.get $b) (i32.shl (local.get $i) (i32.const 2))))
          )
        )
      )
      
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br_if $loop (i32.lt_u (local.get $i) (local.get $size)))
    )
    
    (local.get $sum)
  )
  
  ;; Vector cross product (3D)
  (func $crossProduct (export "crossProduct")
    (param $a i32) (param $b i32) (param $result i32)
    (local $ax f32) (local $ay f32) (local $az f32)
    (local $bx f32) (local $by f32) (local $bz f32)
    
    ;; Load vector components
    (local.set $ax (f32.load (local.get $a)))
    (local.set $ay (f32.load (i32.add (local.get $a) (i32.const 4))))
    (local.set $az (f32.load (i32.add (local.get $a) (i32.const 8))))
    
    (local.set $bx (f32.load (local.get $b)))
    (local.set $by (f32.load (i32.add (local.get $b) (i32.const 4))))
    (local.set $bz (f32.load (i32.add (local.get $b) (i32.const 8))))
    
    ;; Calculate cross product
    ;; result.x = a.y * b.z - a.z * b.y
    (f32.store (local.get $result)
      (f32.sub
        (f32.mul (local.get $ay) (local.get $bz))
        (f32.mul (local.get $az) (local.get $by))
      )
    )
    
    ;; result.y = a.z * b.x - a.x * b.z
    (f32.store (i32.add (local.get $result) (i32.const 4))
      (f32.sub
        (f32.mul (local.get $az) (local.get $bx))
        (f32.mul (local.get $ax) (local.get $bz))
      )
    )
    
    ;; result.z = a.x * b.y - a.y * b.x
    (f32.store (i32.add (local.get $result) (i32.const 8))
      (f32.sub
        (f32.mul (local.get $ax) (local.get $by))
        (f32.mul (local.get $ay) (local.get $bx))
      )
    )
  )
  
  ;; Matrix transpose
  (func $transpose (export "transpose")
    (param $matrix i32) (param $result i32) (param $size i32)
    (local $i i32)
    (local $j i32)
    (local $src_idx i32)
    (local $dst_idx i32)
    
    (local.set $i (i32.const 0))
    (loop $i_loop
      (local.set $j (i32.const 0))
      (loop $j_loop
        ;; src[i][j] -> dst[j][i]
        (local.set $src_idx
          (i32.add (local.get $matrix)
            (i32.shl
              (i32.add
                (i32.mul (local.get $i) (local.get $size))
                (local.get $j)
              )
              (i32.const 2)
            )
          )
        )
        
        (local.set $dst_idx
          (i32.add (local.get $result)
            (i32.shl
              (i32.add
                (i32.mul (local.get $j) (local.get $size))
                (local.get $i)
              )
              (i32.const 2)
            )
          )
        )
        
        (f32.store (local.get $dst_idx) (f32.load (local.get $src_idx)))
        
        (local.set $j (i32.add (local.get $j) (i32.const 1)))
        (br_if $j_loop (i32.lt_u (local.get $j) (local.get $size)))
      )
      
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br_if $i_loop (i32.lt_u (local.get $i) (local.get $size)))
    )
  )
  
  ;; Matrix determinant (3x3)
  (func $determinant3x3 (export "determinant3x3")
    (param $matrix i32) (result f32)
    (local $m00 f32) (local $m01 f32) (local $m02 f32)
    (local $m10 f32) (local $m11 f32) (local $m12 f32)
    (local $m20 f32) (local $m21 f32) (local $m22 f32)
    
    ;; Load matrix elements
    (local.set $m00 (f32.load (local.get $matrix)))
    (local.set $m01 (f32.load (i32.add (local.get $matrix) (i32.const 4))))
    (local.set $m02 (f32.load (i32.add (local.get $matrix) (i32.const 8))))
    (local.set $m10 (f32.load (i32.add (local.get $matrix) (i32.const 12))))
    (local.set $m11 (f32.load (i32.add (local.get $matrix) (i32.const 16))))
    (local.set $m12 (f32.load (i32.add (local.get $matrix) (i32.const 20))))
    (local.set $m20 (f32.load (i32.add (local.get $matrix) (i32.const 24))))
    (local.set $m21 (f32.load (i32.add (local.get $matrix) (i32.const 28))))
    (local.set $m22 (f32.load (i32.add (local.get $matrix) (i32.const 32))))
    
    ;; Calculate determinant using rule of Sarrus
    (f32.add
      (f32.add
        (f32.mul (local.get $m00)
          (f32.sub
            (f32.mul (local.get $m11) (local.get $m22))
            (f32.mul (local.get $m12) (local.get $m21))
          )
        )
        (f32.mul (local.get $m01)
          (f32.sub
            (f32.mul (local.get $m12) (local.get $m20))
            (f32.mul (local.get $m10) (local.get $m22))
          )
        )
      )
      (f32.mul (local.get $m02)
        (f32.sub
          (f32.mul (local.get $m10) (local.get $m21))
          (f32.mul (local.get $m11) (local.get $m20))
        )
      )
    )
  )
  
  ;; Matrix inverse (3x3)
  (func $inverse3x3 (export "inverse3x3")
    (param $matrix i32) (param $result i32) (result i32)
    (local $det f32)
    (local $inv_det f32)
    (local $m00 f32) (local $m01 f32) (local $m02 f32)
    (local $m10 f32) (local $m11 f32) (local $m12 f32)
    (local $m20 f32) (local $m21 f32) (local $m22 f32)
    
    ;; Calculate determinant
    (local.set $det (call $determinant3x3 (local.get $matrix)))
    
    ;; Check if matrix is singular
    (if (f32.lt (f32.abs (local.get $det)) (f32.const 1e-6))
      (return (i32.const 0)) ;; Matrix is singular
    )
    
    (local.set $inv_det (f32.div (f32.const 1) (local.get $det)))
    
    ;; Load matrix elements
    (local.set $m00 (f32.load (local.get $matrix)))
    (local.set $m01 (f32.load (i32.add (local.get $matrix) (i32.const 4))))
    (local.set $m02 (f32.load (i32.add (local.get $matrix) (i32.const 8))))
    (local.set $m10 (f32.load (i32.add (local.get $matrix) (i32.const 12))))
    (local.set $m11 (f32.load (i32.add (local.get $matrix) (i32.const 16))))
    (local.set $m12 (f32.load (i32.add (local.get $matrix) (i32.const 20))))
    (local.set $m20 (f32.load (i32.add (local.get $matrix) (i32.const 24))))
    (local.set $m21 (f32.load (i32.add (local.get $matrix) (i32.const 28))))
    (local.set $m22 (f32.load (i32.add (local.get $matrix) (i32.const 32))))
    
    ;; Calculate adjugate matrix and multiply by 1/det
    ;; Row 0
    (f32.store (local.get $result)
      (f32.mul (local.get $inv_det)
        (f32.sub
          (f32.mul (local.get $m11) (local.get $m22))
          (f32.mul (local.get $m12) (local.get $m21))
        )
      )
    )
    (f32.store (i32.add (local.get $result) (i32.const 4))
      (f32.mul (local.get $inv_det)
        (f32.sub
          (f32.mul (local.get $m02) (local.get $m21))
          (f32.mul (local.get $m01) (local.get $m22))
        )
      )
    )
    (f32.store (i32.add (local.get $result) (i32.const 8))
      (f32.mul (local.get $inv_det)
        (f32.sub
          (f32.mul (local.get $m01) (local.get $m12))
          (f32.mul (local.get $m02) (local.get $m11))
        )
      )
    )
    
    ;; Row 1
    (f32.store (i32.add (local.get $result) (i32.const 12))
      (f32.mul (local.get $inv_det)
        (f32.sub
          (f32.mul (local.get $m12) (local.get $m20))
          (f32.mul (local.get $m10) (local.get $m22))
        )
      )
    )
    (f32.store (i32.add (local.get $result) (i32.const 16))
      (f32.mul (local.get $inv_det)
        (f32.sub
          (f32.mul (local.get $m00) (local.get $m22))
          (f32.mul (local.get $m02) (local.get $m20))
        )
      )
    )
    (f32.store (i32.add (local.get $result) (i32.const 20))
      (f32.mul (local.get $inv_det)
        (f32.sub
          (f32.mul (local.get $m02) (local.get $m10))
          (f32.mul (local.get $m00) (local.get $m12))
        )
      )
    )
    
    ;; Row 2
    (f32.store (i32.add (local.get $result) (i32.const 24))
      (f32.mul (local.get $inv_det)
        (f32.sub
          (f32.mul (local.get $m10) (local.get $m21))
          (f32.mul (local.get $m11) (local.get $m20))
        )
      )
    )
    (f32.store (i32.add (local.get $result) (i32.const 28))
      (f32.mul (local.get $inv_det)
        (f32.sub
          (f32.mul (local.get $m01) (local.get $m20))
          (f32.mul (local.get $m00) (local.get $m21))
        )
      )
    )
    (f32.store (i32.add (local.get $result) (i32.const 32))
      (f32.mul (local.get $inv_det)
        (f32.sub
          (f32.mul (local.get $m00) (local.get $m11))
          (f32.mul (local.get $m01) (local.get $m10))
        )
      )
    )
    
    (i32.const 1) ;; Success
  )
  
  ;; Quaternion multiplication
  (func $quaternionMultiply (export "quaternionMultiply")
    (param $q1 i32) (param $q2 i32) (param $result i32)
    (local $w1 f32) (local $x1 f32) (local $y1 f32) (local $z1 f32)
    (local $w2 f32) (local $x2 f32) (local $y2 f32) (local $z2 f32)
    
    ;; Load first quaternion
    (local.set $w1 (f32.load (local.get $q1)))
    (local.set $x1 (f32.load (i32.add (local.get $q1) (i32.const 4))))
    (local.set $y1 (f32.load (i32.add (local.get $q1) (i32.const 8))))
    (local.set $z1 (f32.load (i32.add (local.get $q1) (i32.const 12))))
    
    ;; Load second quaternion
    (local.set $w2 (f32.load (local.get $q2)))
    (local.set $x2 (f32.load (i32.add (local.get $q2) (i32.const 4))))
    (local.set $y2 (f32.load (i32.add (local.get $q2) (i32.const 8))))
    (local.set $z2 (f32.load (i32.add (local.get $q2) (i32.const 12))))
    
    ;; Calculate result quaternion
    ;; w = w1*w2 - x1*x2 - y1*y2 - z1*z2
    (f32.store (local.get $result)
      (f32.sub
        (f32.sub
          (f32.sub
            (f32.mul (local.get $w1) (local.get $w2))
            (f32.mul (local.get $x1) (local.get $x2))
          )
          (f32.mul (local.get $y1) (local.get $y2))
        )
        (f32.mul (local.get $z1) (local.get $z2))
      )
    )
    
    ;; x = w1*x2 + x1*w2 + y1*z2 - z1*y2
    (f32.store (i32.add (local.get $result) (i32.const 4))
      (f32.sub
        (f32.add
          (f32.add
            (f32.mul (local.get $w1) (local.get $x2))
            (f32.mul (local.get $x1) (local.get $w2))
          )
          (f32.mul (local.get $y1) (local.get $z2))
        )
        (f32.mul (local.get $z1) (local.get $y2))
      )
    )
    
    ;; y = w1*y2 - x1*z2 + y1*w2 + z1*x2
    (f32.store (i32.add (local.get $result) (i32.const 8))
      (f32.add
        (f32.add
          (f32.sub
            (f32.mul (local.get $w1) (local.get $y2))
            (f32.mul (local.get $x1) (local.get $z2))
          )
          (f32.mul (local.get $y1) (local.get $w2))
        )
        (f32.mul (local.get $z1) (local.get $x2))
      )
    )
    
    ;; z = w1*z2 + x1*y2 - y1*x2 + z1*w2
    (f32.store (i32.add (local.get $result) (i32.const 12))
      (f32.add
        (f32.sub
          (f32.add
            (f32.mul (local.get $w1) (local.get $z2))
            (f32.mul (local.get $x1) (local.get $y2))
          )
          (f32.mul (local.get $y1) (local.get $x2))
        )
        (f32.mul (local.get $z1) (local.get $w2))
      )
    )
  )
  
  ;; Fast square root approximation (Quake's fast inverse square root)
  (func $fastSqrt (export "fastSqrt") (param $x f32) (result f32)
    (local $half f32)
    (local $i i32)
    (local $y f32)
    
    (local.set $half (f32.mul (local.get $x) (f32.const 0.5)))
    (local.set $i (i32.reinterpret_f32 (local.get $x)))
    (local.set $i (i32.sub (i32.const 0x5f3759df) (i32.shr_u (local.get $i) (i32.const 1))))
    (local.set $y (f32.reinterpret_i32 (local.get $i)))
    
    ;; Newton iteration
    (local.set $y 
      (f32.mul (local.get $y)
        (f32.sub (f32.const 1.5)
          (f32.mul (local.get $half)
            (f32.mul (local.get $y) (local.get $y))
          )
        )
      )
    )
    
    ;; Return sqrt(x) = x * (1/sqrt(x))
    (f32.mul (local.get $x) (local.get $y))
  )
  
  ;; Global heap pointer
  (global $heap_ptr (mut i32) (i32.const 0))
)