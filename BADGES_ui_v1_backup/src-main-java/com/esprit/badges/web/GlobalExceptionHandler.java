package com.esprit.badges.web;

import com.esprit.badges.blockchain.BlockchainException;
import com.esprit.badges.blockchain.ContractRevertException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.Map;

/** Gestionnaire d'erreurs commun : transforme toute exception en reponse JSON propre. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApi(ApiException e) {
        return ResponseEntity.status(e.getStatus()).body(Api.error(e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(f -> f.getField() + " : " + f.getDefaultMessage())
                .orElse("Donnees invalides");
        return ResponseEntity.badRequest().body(Api.error(message));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String, Object>> handleUnreadable(Exception e) {
        return ResponseEntity.badRequest().body(Api.error("Requete invalide (JSON ou parametre incorrect)"));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, Object>> handleConflict(DataIntegrityViolationException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Api.error("Conflit : cette donnee existe deja"));
    }

    /** Le smart contract a refuse : ce n'est pas une panne, c'est une regle appliquee sur la blockchain. */
    @ExceptionHandler(ContractRevertException.class)
    public ResponseEntity<Map<String, Object>> handleRevert(ContractRevertException e) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Api.error(e.getMessage()));
    }

    /** Reseau injoignable, solde insuffisant, cle invalide... */
    @ExceptionHandler(BlockchainException.class)
    public ResponseEntity<Map<String, Object>> handleBlockchain(BlockchainException e) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Api.error("Blockchain indisponible : " + e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleOther(Exception e) {
        Map<String, Object> body = Api.error("Erreur serveur");
        body.put("error", e.getMessage());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }
}
